# Query per il database

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

## Anagrafica clienti

Eseguire **tutto** `006_customers.sql` una volta, dopo le tabelle degli operatori
e le policy di 001. Non dipende dalle tabelle del materiale.

`customers` contiene `id`, `first_name`, `last_name`, `phone`, `email`, `notes`,
`document_path`, `created_at`, `updated_at`. Solo nome e cognome sono obbligatori;
ID e date sono generati automaticamente. L'ultima modifica si aggiorna con un trigger.
Cellulare ed email non sono univoci e possono essere condivisi da familiari.

Non contiene albergo o sconti: saranno associati alla prenotazione, perché possono
cambiare da un soggiorno all'altro. Non contiene neppure una sede proprietaria:
gli operatori con un profilo e almeno una sede assegnata possono leggere, inserire
e aggiornare i clienti condivisi. RLS e permessi impediscono accesso anonimo e
cancellazione dagli account operatore.

`document_path` è facoltativo e contiene il percorso della foto, non il contenuto
del file o un URL pubblico. Bucket privato, caricamento e accesso alle foto saranno
implementati separatamente; questa query prepara soltanto la tabella clienti.
La pagina `/clienti` legge l'anagrafica tramite `GET /api/v1/customers`.
Mostra nome, cognome, email, telefono e note, con ricerca sui primi quattro campi.
Non occorrono nuove query oltre a 006. L'inserimento tramite `POST /api/v1/customers`
è disponibile dal primo passaggio del nuovo noleggio. Il collegamento alle
prenotazioni sarà aggiunto successivamente.

## Prenotazioni e pagamenti

Eseguire **tutto** `007_rental_bookings_and_payments.sql` una volta, dopo 001,
002 e 006. Non richiede di ripetere l'importazione del materiale. Se una delle
nuove tabelle esiste già, fermarsi e confrontare lo schema senza cancellare dati.

La query crea:

- `hotels`: ID, nome, attivo, date di creazione/modifica. Include i due nomi
  provvisori Albergo 1 e Albergo 2, senza convenzioni o sconti automatici.
- `rental_bookings`: ID, numero progressivo globale, cliente, sede, inizio e
  rientro previsto, albergo facoltativo, stato, percentuale di sconto applicata,
  note, operatore, date di creazione/modifica. Le date possono coincidere.
- `rental_booking_items`: un esemplare per riga, con collegamenti a prenotazione
  e inventario, copia storica di codice/marca/modello/misura, tariffa giornaliera
  facoltativa, importo complessivo, consegna e rientro effettivi e date tecniche.
  Lo stesso esemplare non può comparire due volte nella stessa prenotazione.
- `rental_payments`: ID, prenotazione, metodo, importo positivo, **data e ora
  effettive del pagamento (`paid_at`, timestamptz)**, operatore, note e data di
  registrazione (`created_at`). I metodi restano testo, in attesa dell'elenco definitivo.

Gli stati sono `confirmed` (prenotato), `preparing` (in preparazione), `active`
(consegnato), `completed` (concluso), `cancelled` (annullato). Consegne e rientri
sono registrabili per singolo articolo, per consentire restituzioni parziali.

Totale: somma degli importi delle righe, con lo sconto percentuale complessivo
e arrotondamento ai centesimi. Pagato: somma dei pagamenti; residuo: totale meno
pagato. Le somme delle righe e dei pagamenti devono essere aggregate separatamente,
per evitare di moltiplicarle unendo due relazioni uno-a-molti. Non esistono campi
manuali duplicati per totale o stato del saldo. Gli importi sono in euro.

«Paga dopo» non inserisce righe pagamento; un acconto e un saldo successivo sono
due righe distinte. Un pagamento completo è una sola riga. `paid_at` conserva
l'istante con fuso orario, da mostrare nell'orario locale dell'interfaccia.
I pagamenti sono soltanto registrazioni: nessun collegamento alla cassa.

RLS attiva e sola lettura per gli operatori: alberghi condivisi e prenotazioni,
articoli e pagamenti limitati alle sedi assegnate. Non sono ancora abilitate
scritture da frontend/backend, né collegamenti automatici al modulo attuale.
Le future funzioni transazionali dovranno verificare articoli della sede corretta,
disponibilità e sovrapposizioni (anche concorrenti), prezzi, incassi e cambi di stato.
Questa prima query **non riserva materiale e non impedisce sovrapposizioni tra
prenotazioni diverse**. Non applica automaticamente lo sconto alberghi del 15%,
ancora da confermare, né deduce prezzi o durata tariffaria dai giorni di calendario.

Test predisposti in `tests/integration/test_rental_bookings_sql.py` per PostgreSQL
temporaneo: data/ora, acconti e saldo, importi, date, duplicati, rientri, storico e RLS.
Si avviano impostando `SKIRENTING_TEST_PG_HOST` e `SKIRENTING_TEST_PG_PORT` come
per gli altri test SQL; senza un cluster temporaneo configurato vengono saltati.

## Management Hotels

Dopo 007 eseguire tutto `008_hotels_management.sql`: abilita inserimento del nome
e aggiornamento del solo flag `is_active` per operatori con profilo e almeno una
sede assegnata. Mantiene RLS e divieto di cancellazione fisica. La query può essere
ripetuta. L'indice univoco impedisce nomi duplicati anche con maiuscole o spazi
esterni diversi; se esistono già duplicati nel database, verificarli prima di eseguirla.

`GET /api/v1/hotels` legge gli alberghi attivi condivisi, `POST /api/v1/hotels` ne
aggiunge uno e `DELETE /api/v1/hotels/{id}` lo disattiva tramite UPDATE con il token
dell'operatore. Prenotazioni e riferimenti restano intatti. Aggiungere il nome di un
albergo disattivato riattiva il suo ID; un nome già attivo restituisce 409.
Non sono aggiunti sconti o convenzioni automatiche.

## Sconto per albergo

Eseguire `009_hotels_discount.sql` dopo 008. Aggiunge `hotels.discount` come
percentuale `numeric(5,2)`, obbligatoria, tra 0 e 100, con default 0 anche per
gli alberghi già esistenti. Non viene assunto uno sconto del 15%.
Concede inserimento e modifica della sola colonna aggiunta, mantenendo le policy
RLS degli alberghi. Può essere ripetuta senza azzerare gli sconti già inseriti.

In Gestione → Alberghi si può indicare lo sconto in creazione e modificarlo con
`PATCH /api/v1/hotels/{id}`. L'API accetta al massimo due cifre decimali e rifiuta
valori mancanti, negativi o superiori a 100. Riattivare un albergo rimosso tramite
il modulo di creazione applica lo sconto indicato nel modulo alla stessa voce.
Il collegamento della convenzione al calcolo del totale del noleggio rimane da
implementare: il futuro salvataggio dovrà copiare lo sconto effettivamente applicato
in `rental_bookings.discount_percent`, senza cambiare le prenotazioni storiche.

## Listino noleggio per tipo di materiale

Eseguire **tutto** `010_rental_rates.sql` una volta, dopo 001 e 002. Crea
`rental_rates` con una riga per gruppo (`group_id` univoco) e sette colonne:
`daily_price_1_day`, `daily_price_2_days`, `daily_price_3_days`, `daily_price_4_days`,
`daily_price_5_days`, `daily_price_6_days`, `daily_price_7_plus_days`.
Sono importi giornalieri, non totali: per 8 giorni si userà la tariffa 7+ moltiplicata
per 8. Le regole di conteggio del periodo e il calcolo della prenotazione restano da collegare.

Le righe dei gruppi esistenti vengono predisposte con prezzi null, mai dedotti dai
PDF. Null significa da configurare, zero significa gratuito. Ogni nuovo gruppo
creato tramite la funzione di 005 o dal SQL Editor riceve una riga vuota tramite
trigger. I prezzi accettano due decimali e importi non negativi. Le date di creazione
e modifica sono automatiche. La tabella non ha una sede: il listino è condiviso.

RLS consente lettura e modifica delle sole sette colonne prezzo agli operatori con
profilo e almeno una sede. Non sono consentiti inserimenti o cancellazioni diretti,
né cambi del gruppo da account operatore. I valori applicati nei noleggi rimangono
nella tabella delle righe della prenotazione e non vengono aggiornati dal listino.

Gestione → Tariffe usa `GET /api/v1/rental-rates` (categorie e gruppi attivi con
prezzi) e `PATCH /api/v1/rental-rates/{id}` (tutte le sette colonne, anche null).
L'interfaccia separa Sci, Snowboard, Scarponi sci, Scarponi snowboard e gli altri
tipi di materiale. Ogni gruppo ha un pulsante Salva. Non occorre una tabella per
ogni categoria e non vengono create sette righe per gruppo.

Test API e frontend eseguiti con servizi simulati: tipi di materiale, paginazione,
salvataggio, campi null/zero, limiti dei prezzi, permessi, errori e annullamento.
La query resta da applicare e verificare sul progetto Supabase reale.

## Trasferimento di un esemplare tra sedi

Eseguire tutto `011_rental_inventory_transfers.sql` una volta dopo 007. La query
aggiunge lo storico `rental_inventory_transfers` (esemplare, origine, destinazione,
operatore e data/ora) e la funzione `skirenting_transfer_rental_item`.

Il backend espone `POST /api/v1/locations/{source}/rental-inventory/{item}/transfer`
con `destination_location_id`. Verifica entrambe le sedi e usa il token Supabase
dell'operatore, senza chiavi segrete. La funzione controlla di nuovo profilo e
assegnazioni, blocca la riga dell'esemplare, confronta la sede effettiva con
quella attesa e aggiorna la sede insieme al movimento in una sola transazione.
Non modifica codici, modello, stato, prezzi o prenotazioni passate e non copia
o ricrea l'esemplare nella destinazione.

Il trasferimento viene rifiutato se ci sono righe non rientrate di prenotazioni
`confirmed`, `preparing` o `active`, anche future. I futuri flussi di assegnazione
del materiale dovranno acquisire lo stesso lock sull'esemplare prima di controllare
la disponibilità, per coordinarsi con i trasferimenti concorrenti.

Non vengono concesse scritture dirette sull'inventario o sullo storico movimenti.
Lo storico è leggibile dagli operatori assegnati ad almeno una delle due sedi.
Test API/frontend eseguiti con Supabase simulato; query da applicare e verificare
sul progetto reale. Il trasferimento riguarda solo il magazzino noleggio, che è
quello attualmente collegato ai dati reali.
