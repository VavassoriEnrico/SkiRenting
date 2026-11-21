# Query per il materiale

Questi file si eseguono manualmente nel SQL Editor di Supabase. Non sono stati
applicati al progetto remoto dall'assistente e non modificano automaticamente il frontend.

## Preparazione delle tabelle

1. Verificare che in `public.locations` esista esattamente una sede chiamata
   Madesimo (maiuscole/minuscole non fanno differenza).
2. Le tre tabelle esistenti devono essere `locations`, `operator_profiles`
   e `operator_locations`, come definite in precedenza.
3. Eseguire **tutto** `002_material_catalog_and_inventory.sql` in una sola volta.
   Lo script è per la creazione iniziale: se una delle nuove tabelle esiste già,
   non eliminarla per aggirare l'errore; verificare prima lo schema esistente.

Lo script crea 10 categorie e i 23 gruppi originali dei PDF, senza inserire tariffe.
Le categorie Bastoncini e Maschere rimangono predisposte, senza inventare gruppi
non presenti nei file. Gli inventari e il catalogo varianti rimangono vuoti.

## Tabelle e colonne

| Tabella | Dati |
| --- | --- |
| `material_categories` | ID, codice interno stabile, nome, data creazione |
| `material_groups` | ID, categoria, nome originale, attivo, data creazione |
| `material_variants` | ID, categoria, marca, modello, anno originale, note, attivo, date creazione/modifica |
| `ski_details` | ID variante, lunghezza cm, raggio m, tipo tecnico opzionale |
| `snowboard_details` | ID variante, lunghezza cm, raggio m, tipo tecnico opzionale |
| `boot_details` | ID variante, taglia originale, sistema della taglia, taglia EU, lunghezza piede cm, lunghezza suola mm |
| `helmet_details` | ID variante, taglia, colore |
| `pole_details` | ID variante, altezza cm |
| `goggle_details` | ID variante, lente |
| `accessory_details` | ID variante, taglia testuale per ciaspole, ARVA e bob |
| `rental_inventory` | ID, variante, gruppo, sede, codice, seriale, stato, noleggiabile/prenotabile, prezzo acquisto e prezzo venduto originale, note, file/pagina/dati originali, date creazione/modifica |
| `sale_inventory` | ID, variante, sede, quantità, prezzo unitario vendita, note, date creazione/modifica |

Marca/modello possono ripetersi nelle varianti. Per decidere se una variante è già
presente, confrontare categoria, marca, modello, anno e tutte le caratteristiche
pertinenti (lunghezza, taglia, colore ecc.). Non esiste un vincolo solo su marca/modello.
Il backend di inserimento e la procedura d'importazione dovranno gestire questa ricerca.

Gli ID delle tabelle di dettaglio coincidono con l'ID della variante: prima si crea
la variante e poi si inserisce la riga di dettaglio corretta. Il database controlla
che, per esempio, `ski_details` appartenga a Sci e non a Caschi.
Taglia EU, centimetri del piede e millimetri della suola sono dati distinti:
non ricavarli automaticamente dalla taglia originale del PDF.

`year` conserva l'anno indicato nel vecchio gestionale, senza attribuirgli automaticamente
il significato di anno d'acquisto. Il valore originale può essere mantenuto anche in
`source_data` per consentire verifiche successive.

## Inserimento dei dati

Per ogni variante:

1. Cercare la categoria in `material_categories` e il gruppo in `material_groups`.
2. Inserire la variante con marca, modello e anno.
3. Inserire le caratteristiche nella tabella di dettaglio corrispondente.
4. Inserire in `rental_inventory` una riga per codice, associata alla stessa variante,
   al gruppo corretto e all'ID di Madesimo.

Tutti gli esemplari dell'importazione iniziale vanno a Madesimo. La sede è un dato
obbligatorio dell'esemplare; il catalogo delle varianti è condiviso e non ha una sede.
L'assegnazione non avviene tramite un default nascosto, per evitare che gli inserimenti
futuri finiscano nella sede sbagliata.

`003_example_load_ski.sql` è un esempio facoltativo con tre esemplari reali:
PO445, PO539 e PO540, tutti BLIZZARD ANOMALY 84 R, 164 cm, anno 2025.
È indipendente dalla creazione delle tabelle e **non è il caricamento completo**.
Eseguirlo solo se si desidera inserire questi articoli e non sono già presenti.

Le righe dei PDF sono state successivamente ricostruite e verificate per coordinate.
Per il caricamento completo usare `004_import_all_rental_items.sql`, dopo la creazione
delle tabelle: 1.305 esemplari con codici distinti e 547 varianti. I nuovi esemplari
vanno a Madesimo. Lo script riconosce i tre sci già caricati dall'esempio e può
essere ripetuto senza duplicazioni. I codici particolari restano quelli originali.
Dettagli e verifiche: [importazione completa](../../docs/analisi-materiale/import/README.md).

## Quantità, prezzi e tariffe

- Noleggio: una riga è un esemplare, paio o kit. Nessuna colonna quantità:
  il riepilogo conta gli esemplari per variante e sede.
- Vendita: una riga è una variante in una sede, con quantità intera non negativa.
- Il materiale noleggio non viene copiato automaticamente nelle giacenze vendita.
- I prezzi sconosciuti restano null. Il prezzo di acquisto e PRZ VENDUTO dei PDF
  non diventano tariffe di noleggio.
- I gruppi tariffari vengono conservati, ma gli importi e le regole delle tariffe
  saranno definiti in seguito.
- Stato `active` e flag noleggiabile/prenotabile non provano la disponibilità
  in un periodo: quella dipenderà dalle future prenotazioni.

## Accessi

RLS attiva su tutte le nuove tabelle. Il catalogo è leggibile dagli utenti con un
profilo operatore. Le giacenze sono leggibili soltanto nelle sedi assegnate tramite
`operator_locations`. Le policy degli operatori di `001_operator_read_policies.sql`
devono essere già presenti sul progetto.

Per ora non sono abilitate scritture dal frontend: il caricamento avviene dal
SQL Editor o Table Editor con l'account amministrativo Supabase. Inserimento,
modifica, vendita e trasferimenti nell'app saranno collegati in un passaggio successivo.

## Verifica effettuata

Lo schema è stato eseguito in un PostgreSQL 14 temporaneo con le tre tabelle
preesistenti simulate e le policy degli operatori. Verificati: seed delle 10 categorie
e dei 23 gruppi, coerenza categoria/dettagli/gruppo, codici duplicati, conservazione
di zeri/simboli/codici lunghi, misure ignote, quantità negative, letture per sede,
assenza di scritture degli utenti e cambio di accesso dopo un trasferimento.
Questo test non applica lo script al progetto Supabase reale.

## Inserimento dal gestionale

Dopo 001 e 002, eseguire **tutto** `005_create_rental_item.sql` nel SQL Editor.
Non è necessario rieseguire lo schema 002 o l'importazione 004. La query 005 può
essere ripetuta e conserva gli esemplari importati.

Abilita il pulsante **Nuovo articolo** del magazzino noleggio. Si può scegliere
categoria, gruppo e variante esistenti o crearne di nuovi. Una nuova categoria
sceglie una famiglia di campi (`detail_type`), per esempio Sci o Scarponi; il
controllo delle tabelle di dettaglio resta valido anche per categorie personalizzate.

La funzione `skirenting_create_rental_item` salva tutte le righe in una transazione,
verifica `auth.uid()`, profilo e accesso alla sede, e rifiuta codici già presenti.
Riusa varianti identiche e gruppi omonimi attivi della stessa categoria senza
modificare i dati preesistenti. Non abilita scritture dirette sulle tabelle e non
richiede chiavi segrete nel backend.

Dettagli: [magazzino noleggio](../../docs/magazzino-noleggio.md).
