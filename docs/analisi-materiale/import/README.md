# Importazione completa del materiale da noleggio

I 23 PDF sono stati ricostruiti per celle usando rettangoli delle righe e coordinate
del testo. Risultato: **1.305 esemplari, 1.305 codici distinti e 547 varianti**.
Per ciascun documento il conteggio coincide con il totale stampato nel PDF.

## Esecuzione su Supabase

1. Creare le tabelle con
   [`002_material_catalog_and_inventory.sql`](../../../backend/sql/002_material_catalog_and_inventory.sql),
   se non sono già state create.
2. Aprire
   [`004_import_all_rental_items.sql`](../../../backend/sql/004_import_all_rental_items.sql)
   e incollare **tutto il contenuto** in una nuova query del SQL Editor Supabase.
3. Eseguire con il ruolo amministrativo del SQL Editor.
4. Controllare i risultati: 1.305 articoli, 547 varianti su catalogo inizialmente
   vuoto e Madesimo come sede dei nuovi esemplari. Sono restituiti i conteggi per file.

Non serve eseguire prima `003_example_load_ski.sql`. Se i tre sci sono già presenti,
l'importazione li riconosce: carica gli altri 1.302 e riutilizza la variante.
Non serve inserire chiavi amministrative nel frontend o cambiare le policy RLS.

Lo script è transazionale: codici in conflitto, varianti ambigue, gruppi mancanti
o conteggi errati bloccano tutto, senza caricamenti parziali. Non elimina dati.

La versione aggiornata esegue il caricamento in un unico blocco `DO` autonomo,
senza tabelle temporanee. I riepiloghi successivi possono essere eseguiti anche
su una connessione diversa. Se era stato ricevuto l'errore
`relation "_skirenting_material_rows" does not exist`, riaprire il file aggiornato
e copiarlo interamente in una nuova query; non creare quella tabella manualmente.

## Ripetizione e modifiche successive

- Una seconda esecuzione non duplica esemplari o varianti.
- Un esemplare già presente deve corrispondere alla variante ricostruita dal PDF;
  un codice associato a un materiale diverso blocca l'importazione.
- Sede, gruppo, stato, flag, note e prezzi modificati successivamente sono preservati.
- Raggio e altri dettagli aggiunti alle varianti non sono sovrascritti.
- Modifiche successive a marca/modello/anno/misura possono richiedere la verifica
  di un conflitto prima di rieseguire il caricamento.
- Il magazzino vendita rimane intatto.

## Dati originali e valori mancanti

I codici restano stringhe, inclusi zeri, simboli e numeri lunghi. Ogni articolo
conserva file, pagina e celle originali in
`rental_inventory.source_data.pdf_import_2026_11_11`, con hash SHA-256 del PDF.
Non vengono conservati i contatti personali del piè di pagina.

Le 1.305 celle di S/N, prezzo d'acquisto e prezzo venduto sono vuote:
le colonne operative restano nulle. Non vengono dedotti prezzi dai totali di
listino a piè di tabella e non vengono create tariffe.

Sci e snowboard conservano la lunghezza in cm, senza inventare il raggio.
Gli scarponi conservano la taglia originale con sistema `unknown`, senza conversioni
EU/cm/mm. Marca e modello restano come stampati, anche per eventuali refusi.

## Codici da verificare

| Codice conservato | Documento | Pagina |
| --- | --- | ---: |
| `[FU2379N` | SCARPNI ADULTO PLUS.pdf | 1 |
| `/` | SCARPONI SCI BABY.pdf | 1 |
| `GC4550%` | SCARPONI SCI BABY.pdf | 3 |

Sono inclusi nel totale e segnalati nelle note dei nuovi esemplari, senza inventare
codici sostitutivi. Verificare le etichette fisiche prima dell'uso operativo.
Lo stato originario Noleggiabile e prenotabile è conservato; non si deducono
prenotazioni in corso o disponibilità temporali da questi elenchi.

## File di consultazione

- `articoli.csv`: tutte le 1.305 righe con valori originali e provenienza.
- `articoli.json`: estrazione completa e chiave della variante.
- `varianti.csv`: le 547 varianti e quantità per variante.
- `codici-da-verificare.csv`: i tre codici segnalati.
- `verifiche.json`: conteggi per documento e categoria.
- `test-database.json`: verifiche SQL e hash dello script provato.

I CSV servono per consultazione, non per importazione diretta nelle tabelle operative.
In Excel importare i codici come testo per conservare zeri e numeri lunghi.

## Verifiche eseguite

Prova reale su PostgreSQL 14.21 temporaneo locale, con schema e ruoli simulati:
importazione completa e corrispondenza alle celle originali; riesecuzione senza
cambiamenti agli ID/timestamp; compatibilità con i tre sci d'esempio; conservazione
di trasferimenti, stato, note, prezzo e raggio modificati; RLS per sede; rollback
completo in presenza di un codice in conflitto.
Il progetto Supabase reale non è stato modificato dall'assistente.

## Rigenerazione

Richiede Python e `scripts/material_import/requirements.txt`, soltanto per la
procedura offline. Dalla radice:

```sh
python scripts/material_import/extract.py --pdf-dir "/percorso/dei/pdf"
python scripts/material_import/generate_sql.py
```

L'estrattore si interrompe se formato, conteggi o campi obbligatori non corrispondono.
I 23 PDF non vengono copiati nel repository.
