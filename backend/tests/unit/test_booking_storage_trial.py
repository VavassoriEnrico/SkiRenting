import csv
import importlib.util
from pathlib import Path

import pytest


SOURCE = Path(__file__).resolve().parents[3] / 'scripts/booking_import/local_trial.py'
spec = importlib.util.spec_from_file_location('booking_storage_trial', SOURCE)
trial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trial)


def write_source(path, rows):
    fields = list(dict.fromkeys(trial.GROUP_COLUMNS + trial.PERSON_COLUMNS + (
        'barcode', 'marca', 'modello', 'value_it', 'data_rientro', 'totale_pagato', '',
    )))
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for values in rows:
            writer.writerow({**dict.fromkeys(fields, ''), **values})


def test_trial_preserves_repeated_rows_empty_cells_and_signed_amounts(tmp_path):
    source = tmp_path / 'source.csv'
    row = {'codice': '001', 'id_clienti': '7', 'data_uscita': '01/12/2025',
           'rientro_previsto': '03/12/2025', 'totale_pagato': '-10,00'}
    write_source(source, [row, row, {**row, 'codice': '002', 'data_uscita': '02/12/2025'}])
    loaded, digest, size = trial.load_source(source)
    assert len(loaded) == 3 and loaded[0] == loaded[1]
    assert loaded[0]['totale_pagato'] == '-10,00'
    assert loaded[0]['telefono'] == loaded[0][''] == ''
    assert len(digest) == 64 and size == source.stat().st_size
    assert len({tuple(row[key] for key in trial.GROUP_COLUMNS) for row in loaded}) == 2


def test_trial_rejects_invalid_periods_before_starting_a_database(tmp_path):
    source = tmp_path / 'source.csv'
    write_source(source, [{'data_uscita': '03/12/2025', 'rientro_previsto': '01/12/2025', 'totale_pagato': '10,00'}])
    with pytest.raises(ValueError, match='Periodo non valido'):
        trial.load_source(source)


def test_trial_rejects_non_finite_money(tmp_path):
    source = tmp_path / 'source.csv'
    write_source(source, [{'data_uscita': '01/12/2025', 'rientro_previsto': '03/12/2025', 'totale_pagato': 'NaN'}])
    with pytest.raises(ValueError, match='Importo non finito'):
        trial.load_source(source)
