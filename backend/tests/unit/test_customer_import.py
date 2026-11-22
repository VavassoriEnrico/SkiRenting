import csv
import importlib.util
import io
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / 'scripts/customer_import/generate.py'
spec = importlib.util.spec_from_file_location('customer_import_generator', SCRIPT)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

HEADERS = ['cognome','nome','email','telefono','data_nascita','eta','r_capacita',
           'rentall_privacy','lingua','stato','tot_articoli_noleggiati','pagato','visite','stagionale','']


def write_source(path):
    rows = []
    for first, last in [("O'Brian $$'; select 1; --", 'Rossi'), ('', ''), ('123', '456'), ('Same', 'Person'), ('Same', 'Person')]:
        rows.append([last,first,'','0000123','15/04/1990','36','INTERMEDIO','N','IT','CH','3','-1.250,00','2','S',''])
    content = io.StringIO(newline='')
    writer = csv.writer(content)
    writer.writerow(HEADERS)
    writer.writerows(rows)
    path.write_text(content.getvalue(), encoding='utf-8-sig')
    return rows


def test_import_preserves_blank_numeric_duplicate_and_original_columns(tmp_path):
    source = tmp_path / "clienti'_test.csv"
    original = write_source(source)
    data = generator.load_csv(source)
    assert data['summary'] == {'rows':5, 'rows_with_missing_name':1, 'rows_with_numeric_name':1, 'rows_excluded':0}
    assert len({r['customer_id'] for r in data['records']}) == 5
    for record, row in zip(data['records'], original, strict=True):
        assert list(record['raw_data'].values()) == row
        assert record['birth_date'] == '1990-04-15'
        assert record['skill_level'] == 'intermediate'
    repeated = generator.load_csv(source)
    assert repeated['batch_id'] == data['batch_id']
    assert repeated['records'] == data['records']
    script = generator.render_sql(data)
    assert "O''Brian" in script
    assert "clienti''_test.csv" in script
    assert 'on conflict (id) do nothing' in script
    assert 'on conflict (batch_id,source_row) do nothing' in script


def test_import_rejects_malformed_columns_without_skipping_rows(tmp_path):
    source = tmp_path / 'broken.csv'
    write_source(source)
    with source.open('a') as file:
        file.write('not,enough,columns\n')
    with pytest.raises(ValueError, match='Numero colonne'):
        generator.load_csv(source)


def test_editor_blocks_are_numbered_and_verify_their_own_rows(tmp_path):
    source = tmp_path / 'customers.csv'
    write_source(source)
    data = generator.load_csv(source)
    blocks = generator.render_blocks(data, chunk_size=2)
    assert list(blocks) == ['01_clienti.sql', '02_clienti.sql', '03_clienti.sql']
    assert 'add column if not exists is_legacy' in blocks['01_clienti.sql']
    assert 'add column if not exists is_legacy' not in blocks['02_clienti.sql']
    assert 'source_row between 1 and 2) <> 2' in blocks['01_clienti.sql']
    assert 'source_row between 3 and 4) <> 2' in blocks['02_clienti.sql']
    assert "batch_id='" in blocks['03_clienti.sql'] and ') <> 5' in blocks['03_clienti.sql']
    assert len(data['records']) == 5
