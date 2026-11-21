"""Genera lo SQL di importazione dai dati verificati da extract.py."""

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMPORT_DIR = ROOT / "docs/analisi-materiale/import"
BATCH_KEY = "pdf_import_2026_11_11"


def main():
    rows = json.loads((IMPORT_DIR / "articoli.json").read_text())
    if len(rows) != 1305 or len({row["code"] for row in rows}) != 1305:
        raise ValueError("Attesi esattamente 1305 articoli con codici distinti.")
    payload = []
    for row in rows:
        source = {
            "file": row["source_file"], "page": row["source_page"],
            "row": row["source_row"], "sha256": row["source_sha256"],
            "columns": {
                "CODICE": row["code"], "TIPO": row["type"], "CATEGORIA": row["group"],
                "MARCA": row["brand"], "MODELLO": row["model"], "ANNO": row["year"],
                "S/N": row["serial_number"], "MISURA": row["measure"],
                "STATO": row["status"], "PRZ ACQ": row["purchase_price"],
                "PRZ VENDUTO": row["sold_price"],
            },
        }
        payload.append({
            key: row[key] for key in [
                "code", "category_code", "brand", "model", "year", "measure_canonical",
                "length_cm", "variant_key", "source_file", "source_page", "warning",
            ]
        } | {"group_name": row["group"], "source_data": source})

    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    delimiter = "$skirenting_material_payload$"
    if delimiter in data or "$skirenting_import$" in data:
        raise ValueError("Delimitatore SQL presente nei dati: scegliere un altro delimitatore.")
    counts = Counter(row["source_file"] for row in rows)
    count_values = ",\n".join(
        "  ('" + name.replace("'", "''") + "', " + str(count) + ")"
        for name, count in counts.items()
    )
    template = (Path(__file__).with_name("import_template.sql")).read_text()
    sql = template.replace("__PAYLOAD__", delimiter + data + delimiter)
    sql = sql.replace("__EXPECTED_COUNTS_JSON__", "'" + json.dumps(counts, ensure_ascii=False).replace("'", "''") + "'")
    sql = sql.replace("__FILE_COUNTS__", count_values).replace("__BATCH_KEY__", BATCH_KEY)
    output = ROOT / "backend/sql/004_import_all_rental_items.sql"
    output.write_text(sql)
    print(f"Creato {output.name}: 1305 articoli, {len(set(row['variant_key'] for row in rows))} varianti, {output.stat().st_size:,} byte.")


if __name__ == "__main__":
    main()
