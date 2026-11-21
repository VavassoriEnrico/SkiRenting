"""Estrae le celle dei 23 report TCPDF, usando i rettangoli delle righe.

Uso: python scripts/material_import/extract.py --pdf-dir /percorso/PDF
Richiede PyMuPDF, soltanto per questa procedura offline.
"""

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from decimal import Decimal
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
COLUMNS = [
    "code", "type", "group", "brand", "model", "year", "serial_number",
    "measure", "status", "purchase_price", "sold_price",
]
CATEGORY_CODES = {
    "Sci": "ski", "Snowboard": "snowboard", "Scarponi sci": "ski_boots",
    "Scarponi snowboard": "snowboard_boots", "Caschi": "helmet",
    "Ciaspole": "snowshoes", "ARVA / ARTVA": "avalanche", "Bob / slittini": "sled",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def matches_fill(drawing, color):
    return drawing.get("fill") and all(
        abs(actual - expected) < 0.001
        for actual, expected in zip(drawing["fill"], color, strict=True)
    )


def extract_file(path, expected):
    document = pymupdf.open(path)
    rows = []
    boundaries = None
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    require(len(document) == int(expected["pagine"]), f"Pagine inattese: {path.name}")
    for page_index, page in enumerate(document):
        drawings = page.get_drawings()
        # Ogni esemplare ha una sottile barra azzurra a sinistra della riga.
        strips = sorted(
            (drawing["rect"] for drawing in drawings
             if matches_fill(drawing, (0, 0.8, 1))
             and drawing["rect"].y0 > 100 and 1 < drawing["rect"].width < 4),
            key=lambda rect: rect.y0,
        )
        if not strips:
            continue  # Es. seconda pagina di RACE: intestazione e piè di pagina.
        if boundaries is None:
            first = strips[0]
            cells = sorted(
                (drawing["rect"] for drawing in drawings
                 if matches_fill(drawing, (0.8, 0.8, 0.8))
                 and abs(drawing["rect"].y0 - first.y0) < 0.01
                 and abs(drawing["rect"].y1 - first.y1) < 0.01),
                key=lambda rect: rect.x0,
            )
            require(len(cells) == len(COLUMNS), f"Colonne inattese: {path.name}")
            boundaries = [(cell.x0, cell.x1) for cell in cells]

        words = page.get_text("words")
        for row_index, strip in enumerate(strips):
            row_words = [word for word in words
                         if strip.y0 - 0.1 <= (word[1] + word[3]) / 2 < strip.y1 + 0.1]
            row = {
                "source_file": path.name, "source_page": page_index + 1,
                "source_row": row_index + 1, "source_sha256": digest,
                "category_code": CATEGORY_CODES[expected["famiglia"]],
            }
            assigned = []
            for column, (left, right) in zip(COLUMNS, boundaries, strict=True):
                cell_words = [word for word in row_words
                              if left - 0.05 <= (word[0] + word[2]) / 2 < right - 0.05]
                cell_words.sort(key=lambda word: (round(word[1], 1), word[0]))
                row[column] = " ".join(word[4] for word in cell_words)
                assigned.extend(cell_words)
            require(len(assigned) == len(row_words), f"Testo non assegnato: {path.name}, pagina {page_index + 1}, riga {row_index + 1}")
            require(row["group"] == expected["gruppo_originale"], f"Gruppo inatteso: {row}")
            require(row["status"] == "Noleggiabile e prenotabile", f"Stato da gestire: {row}")
            require(all(row[field] for field in ["code", "brand", "model", "measure"]), f"Campo obbligatorio vuoto: {row}")
            require(re.fullmatch(r"\d{4}", row["year"]), f"Anno non valido: {row}")
            require(row["code"] == row["code"].strip(), f"Spazi nel codice: {row}")
            row["year"] = int(row["year"])
            row["length_cm"] = None
            row["measure_canonical"] = row["measure"]
            if row["category_code"] in ("ski", "snowboard"):
                match = re.fullmatch(r"(\d+(?:[.,]\d+)?) cm", row["measure"])
                require(match, f"Lunghezza non interpretabile: {row}")
                row["length_cm"] = format(Decimal(match[1].replace(",", ".")).normalize(), "f")
                row["measure_canonical"] = row["length_cm"] + " cm"
            elif row["category_code"] in ("ski_boots", "snowboard_boots"):
                require(re.fullmatch(r"\d+(?:[.,]\d+)?", row["measure"]), f"Taglia da verificare: {row}")
                row["measure_canonical"] = format(Decimal(row["measure"].replace(",", ".")).normalize(), "f")
            # Nessuna conversione fra taglia EU, centimetri e lunghezza suola.
            key = [row[field] for field in ["category_code", "brand", "model", "year", "measure_canonical"]]
            row["variant_key"] = hashlib.sha256(json.dumps(key, ensure_ascii=False).encode()).hexdigest()
            row["warning"] = ""
            if not re.fullmatch(r"[A-Za-z0-9+]+", row["code"]):
                row["warning"] = "Codice originale con simboli da verificare; conservato senza correzioni."
            rows.append(row)
    require(len(rows) == int(expected["totale_dichiarato"]), f"Conteggio errato: {path.name}: {len(rows)}")
    document.close()
    return rows


def write_csv(path, rows, fields):
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "docs/analisi-materiale/import")
    args = parser.parse_args()
    with (ROOT / "docs/analisi-materiale/inventario-fonti.csv").open(newline="") as file:
        manifest = list(csv.DictReader(file))
    rows = []
    for expected in manifest:
        rows.extend(extract_file(args.pdf_dir / expected["file"], expected))
        print(f"{expected['file']}: {expected['totale_dichiarato']} righe verificate")
    require(len(rows) == 1305, "Il totale deve essere 1305.")
    code_counts = Counter(row["code"] for row in rows)
    duplicates = {code: count for code, count in code_counts.items() if count > 1}
    require(not duplicates, f"Codici duplicati: {duplicates}")
    # I PDF forniti hanno tutte le colonne S/N e prezzi vuote. Non dedurre i
    # prezzi dai totali di listino stampati sotto le tabelle.
    require(all(not row[field] for row in rows for field in ["serial_number", "purchase_price", "sold_price"]), "Nuovi valori seriali/prezzi: verificare prima di generare l'importazione.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "articoli.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    write_csv(args.output_dir / "articoli.csv", rows, [
        "source_file", "source_page", "source_row", "code", "type", "group", "brand",
        "model", "year", "measure", "serial_number", "status", "purchase_price", "sold_price", "warning",
    ])
    variants = {row["variant_key"]: row for row in rows}
    quantities = Counter(row["variant_key"] for row in rows)
    write_csv(args.output_dir / "varianti.csv", [dict(row, quantity=quantities[key]) for key, row in variants.items()], ["variant_key", "category_code", "brand", "model", "year", "measure_canonical", "quantity"])
    write_csv(args.output_dir / "codici-da-verificare.csv", [row for row in rows if row["warning"]], ["source_file", "source_page", "code", "brand", "model", "measure", "warning"])
    summary = {
        "files": len(manifest), "pages": sum(int(file["pagine"]) for file in manifest),
        "items": len(rows), "unique_codes": len(code_counts), "variants": len(variants),
        "default_location": "Madesimo", "duplicate_codes": duplicates,
        "warnings": [row["code"] for row in rows if row["warning"]],
        "counts_by_file": dict(Counter(row["source_file"] for row in rows)),
        "counts_by_category": dict(Counter(row["category_code"] for row in rows)),
        "empty_prices_and_serials": True,
    }
    (args.output_dir / "verifiche.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(f"OK: {len(rows)} articoli, {len(variants)} varianti, {len(code_counts)} codici univoci.")


if __name__ == "__main__":
    main()
