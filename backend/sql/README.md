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
| `ski_details` | ID variante, lunghezza cm |
| `snowboard_details` | ID variante, lunghezza cm |
| `boot_details` | ID variante, misura originale (`size_label`) |
| `helmet_details` | ID variante, taglia |
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
La convenzione viene letta nel riepilogo prezzi: il futuro salvataggio dovrà
copiare lo sconto effettivamente applicato
in `rental_bookings.discount_percent`, senza cambiare le prenotazioni storiche.

## Listino noleggio per tipo di materiale

Eseguire **tutto** `010_rental_rates.sql` una volta, dopo 001 e 002. Crea
`rental_rates` con una riga per gruppo (`group_id` univoco) e sette colonne:
`daily_price_1_day`, `daily_price_2_days`, `daily_price_3_days`, `daily_price_4_days`,
`daily_price_5_days`, `daily_price_6_days`, `daily_price_7_plus_days`.
Sono importi giornalieri, non totali: per 8 giorni si userà la tariffa 7+ moltiplicata
per 8. Il riepilogo conta inizio e rientro inclusi e calcola gli importi sul backend;
il salvataggio della prenotazione resta da collegare.

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

## Conferma atomica del noleggio

Eseguire tutto `012_confirm_rental_booking.sql` dopo 007, 009 e 010. Aggiunge
`confirmation_hash` alla prenotazione e la funzione autorizzata di conferma.
Non importa dati e non conferma automaticamente le bozze esistenti.

La funzione verifica operatore, sede, cliente, materiale, listino e sconto. Blocca
gli esemplari prima di controllare prenotazioni sovrapposte o consegne non rientrate,
usando lo stesso lock del trasferimento 011. Ricalcola prezzi, durata inclusiva e
totale; se il totale è cambiato rifiuta la conferma e richiede di aggiornare i prezzi.
Salva insieme testata, righe con copie storiche e pagamento facoltativo; ogni errore
annulla tutti gli inserimenti. Gli articoli mantengono il loro codice e stato fisico:
è la prenotazione a occupare il periodo, senza disabilitarli per tutte le date.

L'ID della bozza impedisce duplicazioni nei ritentativi; un'impronta JSON distingue
la stessa richiesta da dati cambiati dopo una conferma già riuscita. Il risultato
restituisce numero prenotazione, totale, pagato e residuo. Il frontend mostra la
conferma ricevuta prima di permettere un nuovo noleggio con una nuova bozza.

Script e vincoli sono stati verificati su PostgreSQL temporaneo, inclusi pagamenti,
ritentativi, rollback e due connessioni concorrenti. L'applicazione della query al
Supabase reale resta manuale. Lo storico legge le tabelle esistenti tramite API
in sola lettura, senza ulteriori migrazioni. Modifiche, annullamenti, vendite e rientri
non vengono collegati da questa query.

La conferma accetta anche `notes` facoltative, fino a 5.000 caratteri, salvate
in `rental_bookings.notes` (colonna già creata da 007). Le note cliente e pagamento
restano distinte. La versione aggiornata di 012 può essere rieseguita per aggiornare
la funzione senza ricreare tabelle o cancellare prenotazioni. I payload senza note
mantengono la compatibilità dei ritentativi con le conferme precedenti.


## 013 — Rientro per codice

Eseguire tutto `013_register_rental_return.sql` dopo 012. Script rieseguibile:
aggiunge returned_by, un registro interno per i ritentativi e la funzione
`skirenting_register_rental_return(location_id, request_id, code)`.
Senza consegne separate, returned_at può esistere anche senza delivered_at;
se presente, delivered_at non può essere successivo al rientro.
La funzione usa il codice esatto dell'esemplare nella sede, cerca un'unica
prenotazione aperta con inizio non futuro e registra il solo articolo riconsegnato.
Blocca esemplare e prenotazione, usando lo stesso ordine della conferma/trasferimento.
Le restituzioni concorrenti della stessa prenotazione vengono serializzate.
Rientro completo e saldo coperto danno completed; altrimenti active.
Non inserisce pagamenti e non cambia lo stato fisico dell'inventario.
Il frontend mostra rosso/giallo/verde in base a materiale mancante e saldo.
Eseguire manualmente sul progetto Supabase: preparare il file non applica la migrazione.


## 014 — Pagamento del saldo nei rientri

Eseguire tutto `014_register_rental_payment.sql` dopo 013. La funzione
`skirenting_register_rental_payment(location_id, booking_id, payment_id, data)`
registra pagamenti manuali per prenotazioni con materiale tutto rientrato.
Non crea altre tabelle: l'ID della riga rental_payments garantisce i ritentativi.
Il lock sulla prenotazione impedisce di superare il residuo in caso di pagamenti
simultanei. Totale e saldo derivano da righe storiche, sconto e pagamenti già salvati.
Saldo parziale mantiene active; saldo completo imposta completed, visibile verde.
Sono richieste membership alla sede e identità operatore; nessun grant di INSERT
o UPDATE diretto viene aggiunto. La funzione è rieseguibile con CREATE OR REPLACE.

La versione aggiornata di 014 consente pagamenti anche con status completed,
se tutto il materiale è rientrato e il saldo è ancora positivo. Lo stato completed
viene conservato anche dopo un versamento parziale. Gli annullati restano bloccati.
Se 014 era già applicata, rieseguire tutto il file per aggiornare la funzione,
senza modificare prenotazioni o pagamenti esistenti.


## 015 — Dati anagrafici aggiuntivi

Eseguire tutto `015_customer_profile_fields.sql` sul database esistente dopo 006.
Aggiunge birth_date, skill_level, language e country_code; sono facoltativi e
rimangono null sui clienti già presenti. Vincoli: nascita finita/non futura,
livello beginner/intermediate/expert e codici di due lettere maiuscole.
Lingua e paese conservano i codici legacy senza deduzioni sulla cittadinanza.
La migrazione è rieseguibile e mantiene grant e RLS già definiti in 006.
Non importa il CSV, non cambia i vincoli di nome/cognome e non aggiunge riepiloghi
storici alla tabella customers. L'importazione sarà un passaggio separato.


## 016 — Clienti storici e archivio dell'importazione

016_legacy_customer_import.sql richiede 015 e aggiunge is_legacy, riservato agli
inserimenti amministrativi. I nomi vuoti sono accettati solo per i clienti storici;
le nuove registrazioni mantengono nome e cognome obbligatori. Grant sulle colonne
escludono is_legacy dalle scritture degli operatori, con RLS invariata.
customer_import_batches e customer_import_rows conservano origine e tutte le celle
CSV; l'archivio è amministrativo, senza accesso anonimo o operatore.

Per il file reale usare `scripts/customer_import/generate.py`: il file generato
`private/customer-imports/import_clienti.sql` include migrazioni e inserimento
completo, quindi basta eseguire quel file intero. Contiene dati personali ed è
escluso da Git. Non scarta righe e non unisce omonimi, ma evita duplicazioni quando
si riesegue la stessa importazione. Non modifica clienti già esistenti.

Per gli editor che rifiutano la query completa, il generatore crea anche
`private/customer-imports/blocchi/01_clienti.sql` e le parti successive. Eseguire
un file per volta in ordine numerico; la prima parte prepara lo schema, l'ultima
controlla il totale. I blocchi mantengono gli UUID del file singolo e sono ripetibili.
Il conteggio intermedio cresce dopo ogni blocco; solo l'ultimo deve raggiungere 5.860
per il CSV clienti_nel_periodo.csv attuale.


## 017 — Gestione clienti

Eseguire tutto `017_customer_management.sql` dopo 015 e 007. La cancellazione è
logica (deleted_at) e conserva i riferimenti in noleggi, pagamenti e archivio CSV.
La RPC skirenting_delete_customer verifica profilo/sedi, è idempotente e non
concede DELETE diretto. I flag deleted_at e is_legacy restano non scrivibili dagli
operatori via REST. La modifica dei normali campi mantiene la policy condivisa.
Un trigger rifiuta nuove prenotazioni per clienti eliminati senza bloccare le
operazioni sui noleggi esistenti. Script rieseguibile, nessuna importazione dati.


## 018 — Storico manutenzioni

Eseguire tutto `018_material_repairs.sql` dopo 002. La tabella material_repairs
collega interventi ai singoli esemplari con tipo, stato, invio, completamento,
note, operatore e timestamp di registrazione/aggiornamento. Tipi: edges (lamine),
wax (sciolina), edges_and_wax (entrambi), other. Stati: in_progress, completed, cancelled.
È obbligatoria la data di completamento solo per completed, non precedente all'invio.
Un indice impedisce due lavorazioni aperte sullo stesso esemplare. Le righe storiche
restano separate: i contatori di utilizzi/interventi verranno calcolati dagli storici.
La lettura è limitata agli operatori della sede attuale dell'esemplare. Le scritture
restano amministrative finché non vengono implementate le funzioni transazionali.
Questa migrazione non modifica disponibilità, stato del magazzino o prenotazioni:
il blocco durante la manutenzione richiede il collegamento operativo successivo.


## 019 — Pagina Riparazioni e consenso al riutilizzo

Eseguire tutto `019_material_repairs_workflow.sql` dopo 018 e 007.
La creazione di una riparazione per codice è riservata a sci/snowboard della sede
abilitati e non impegnati in un noleggio in corso. Registra l'intervento e imposta
l'esemplare in maintenance. L'ID della richiesta evita duplicazioni sui ritentativi.
La conferma esplicita nel nuovo noleggio completa l'esatto intervento indicato,
registra completed_by e completed_at e riattiva il materiale. Un vecchio consenso
non può chiudere un nuovo intervento sullo stesso esemplare. Sono mantenuti i
controlli su sede, operatore, abilitazioni e materiale ancora consegnato.
Un trigger impedisce nuovi abbinamenti a prenotazioni con lavori aperti, anche se
si prova a chiamare direttamente la conferma senza passare dalla finestra UI.
I lock sugli esemplari coordinano creazione, completamento e conferma noleggio.
L'intervento viene chiuso al consenso prima dell'aggiunta alla bozza: resta concluso
anche se successivamente si rimuove l'articolo o si abbandona la bozza.


Il campo `radius_m` è stato rimosso dal modello corrente di sci e snowboard:
letture REST, API, moduli e raggruppamenti non lo usano. La query 002 è allineata
per nuove installazioni; non rieseguirla sul database esistente. Le colonne del
progetto esistente vengono rimosse manualmente dall'amministratore. La query 005
aggiornata non accetta più il raggio tra i dettagli e ignora l'eventuale vecchia
chiave JSON nel confronto delle varianti.

Anche `style` (Tipo tecnico) è stato rimosso da sci e snowboard: i dettagli ora
contengono soltanto ID variante e lunghezza. I gruppi tariffari restano invariati.
Le colonne del database esistente vengono eliminate manualmente; le query 002 e
005 sono allineate al modello corrente per le nuove installazioni.


Per gli scarponi sono rimossi `shoe_size_eu`, `foot_length_cm`, `sole_length_mm`
e `size_system` da API, letture e moduli. Restano `variant_id` e `size_label`.
Dopo l'eliminazione manuale delle quattro colonne sul progetto esistente,
rieseguire **005_create_rental_item.sql** aggiornata: elimina l'aggiunta automatica
`size_system = unknown` e confronta correttamente le varianti senza i campi rimossi.
Non rieseguire la query 002 su un database esistente.


Rimosso anche `helmet_details.color`: i dettagli dei caschi contengono ID variante
e taglia. Backend, moduli, schede e raggruppamenti non usano più il colore.
La query 005 aggiornata ignora i campi dismessi nel confronto delle varianti.


Rimosso `material_variants.notes` da schema, API, schede e modulo nuovo articolo.
Le note degli esemplari, giacenze vendita, riparazioni e prenotazioni restano.
Dopo aver rimosso la colonna, rieseguire **005_create_rental_item.sql** aggiornata:
la funzione esistente cercava `v.notes` e inseriva `material_variants.notes`.

## 020 — Promozioni

Eseguire tutta [020_promotions.sql](020_promotions.sql) nel SQL Editor del progetto,
dopo la configurazione operatori/sedi della query 001. È ripetibile senza eliminare
promozioni. Crea `public.promotions` con:

| Colonna | Contenuto |
| --- | --- |
| `id` | UUID generato dal database |
| `created_at` | Data/ora di creazione generata dal database |
| `name` | Nome obbligatorio, massimo 200 caratteri |
| `promotion_date` | Data singola, altrimenti null |
| `weekdays` | Giorni ricorrenti da 1=lunedì a 7=domenica; vuoto per data singola |
| `discount_percent` | Percentuale da 0 a 100, fino a due decimali |
| `is_active` | Rimozione logica, senza cancellazione del record |

Data e giorni settimanali sono alternativi. Giorni fuori intervallo, duplicati e
null vengono rifiutati. Le promozioni sono condivise tra sedi; solo operatori con
profilo e almeno una sede assegnata possono leggerle e gestirle. Gli operatori
possono inserire nome/periodo/percentuale e aggiornare solo is_active; ID e data
sono generati dal database e non c'è DELETE diretto. Non applica promozioni ai
noleggi né definisce cumulabilità o priorità rispetto ad alberghi o altre promozioni.


## 021 — Applicazione promozioni ai noleggi

Eseguire tutta [021_apply_rental_promotions.sql](021_apply_rental_promotions.sql)
dopo 020 e la conferma 012. Aggiunge promotion_id e promotion_name alle prenotazioni
come riferimenti/snapshot e aggiorna la funzione di conferma. Nessun ricalcolo dei
noleggi già salvati. Una promozione vale solo per noleggi di un giorno, se la data
coincide o il giorno della settimana è incluso. Si usa il massimo tra promozioni e
sconto albergo, senza cumulo. Nei noleggi di più giorni le promozioni non valgono,
ma lo sconto albergo rimane disponibile. Lo sconto scelto è salvato in discount_percent.
La funzione resta idempotente e verifica il preventivo prima di salvare; applicando
di nuovo la vecchia 012 è necessario rieseguire anche 021.


## 022 — Periodi promozionali

Eseguire [022_promotions_period.sql](022_promotions_period.sql) dopo 020 e 012;
include anche l'aggiornamento della conferma previsto da 021. Aggiunge starts_on
ed ends_on a promotions, con estremi inclusi e fine non precedente all'inizio.
Sono alternative data singola, giorni settimanali e periodo: nessuna combinazione.
Conserva promozioni e prenotazioni esistenti ed è ripetibile. Il periodo vale per
qualsiasi noleggio di una sola giornata compresa nell'intervallo; non abilita sconti
promozionali su noleggi di più giorni. Resta il massimo tra promozioni e albergo.

## 023 — Noleggi stagionali

Eseguire tutta [023_seasonal_rentals.sql](023_seasonal_rentals.sql) dopo 022 e le
migrazioni del magazzino, dei noleggi e dei pagamenti. La query è ripetibile.
Crea `rental_seasons` (nome, data di consegna globale, stagione corrente) e
`seasonal_rates` (gruppo, prezzo singolo, prezzo pack). I prezzi sono totali per
lo stagionale; campi null indicano tariffe da configurare, zero indica gratuito.
Ogni gruppo esistente o nuovo riceve una riga tariffa vuota.

Le prenotazioni riusano `rental_bookings`, `rental_booking_items` e
`rental_payments`: `rental_kind` distingue daily/seasonal, `season_id` identifica
la stagione e le righe conservano formula e riferimento al pack. I pack sono
riconosciuti automaticamente dai codici selezionati: sci/snowboard, scarponi
compatibili; i bastoncini sono facoltativi e inclusi solo nei pack sci. In caso di più attrezzi si segue l'ordine di inserimento,
senza riutilizzare esemplari. Il prezzo pack è addebitato sull'attrezzo; gli altri
codici del pack sono inclusi a zero ma restano occupati e devono rientrare singolarmente.
Gli articoli fuori dai pack mantengono la tariffa singola.

Configurare stagione, consegna e listino in Gestione → Tariffe stagionali prima
di confermare un noleggio. La consegna è interpretata come data di restituzione
comune ai nuovi stagionali; modifiche successive non cambiano date e importi già
salvati. Preventivo e conferma ricalcolano i pack nel database; la conferma atomica
verifica disponibilità, data globale e totale, registra l'eventuale acconto e
mantiene l'idempotenza. Le tariffe stagionali non applicano sconti giornalieri.
Le configurazioni sono condivise fra sedi, le prenotazioni appartengono alla sede.

## 024 — Pack stagionali senza obbligo di bastoncini

Eseguire [024_seasonal_automatic_packs.sql](024_seasonal_automatic_packs.sql)
dopo 023 anche se le tabelle stagionali sono già state create. Aggiorna il
riconoscimento automatico: sci + scarponi compatibili oppure snowboard + scarponi
compatibili formano subito un pack. I bastoncini sono facoltativi e inclusi nei
pack sci, mentre quelli aggiunti a un pack snowboard restano singoli. Un esemplare
non è mai condiviso tra pack; gli abbinamenti seguono l'ordine di inserimento.
Non modifica prenotazioni o prezzi storici; conferma e preventivo usano la stessa
funzione aggiornata. La query è ripetibile.

## 025 — Bastoncini con codice generico 1

Eseguire [025_generic_poles.sql](025_generic_poles.sql) dopo 024. Crea il gruppo
«Bastoncini generici» e un'unica voce globale di rental_inventory con codice `1`,
is_generic=true e location_id null. La voce è disponibile nei nuovi noleggi di
tutte le sedi autorizzate e non è conteggiata come esemplare fisico nei magazzini.
Non elimina né modifica gli esemplari e le prenotazioni esistenti. Se il codice 1
è già assegnato a un esemplare, interrompe la migrazione prima di modificarlo.

Il codice può essere usato contemporaneamente in più prenotazioni giornaliere o
stagionali. Ogni prenotazione conserva la propria riga, importo e rientro. Con
gli sci, anche senza scarponi, i bastoncini sono inclusi a zero; senza sci usano
il prezzo del gruppo nel rispettivo listino. I prezzi iniziali restano null e
vanno impostati in Tariffe e Tariffe stagionali. I pack sci + scarponi mantengono
il proprio prezzo stagionale.

La conferma atomica esclude solo le voci generiche dal controllo di occupazione;
continua a verificare disponibilità e sede degli esemplari fisici. I rientri del
codice 1 usano skirenting_register_generic_return con ID prenotazione esplicito,
senza scegliere arbitrariamente fra i noleggi aperti. Aprire la scheda di rientro
del noleggio e premere «Registra un altro rientro», poi inserire 1; è possibile
anche inserirlo dopo il codice degli sci nello stesso modulo di rientro.

## 026 — Più righe per il codice 1 nella stessa prenotazione

Eseguire [026_generic_pole_quantities.sql](026_generic_pole_quantities.sql) dopo
025. Ogni inserimento di 1 aggiunge un paio, visualizzato su una riga separata.
L'API trasmette pole_quantity (da 1 a 1000) insieme agli ID distinti; preventivo e
conferma espandono la voce in righe indipendenti. Il vincolo di unicità degli
esemplari rimane attivo solo per materiale fisico: un trigger ricava is_generic
dall'inventario, senza fidarsi dei dati della richiesta.

Un paio di bastoncini per ogni paio di sci è gratuito; le paia in eccedenza usano
la tariffa del gruppo Bastoncini generici nel rispettivo listino. Ogni riga
inclusa conserva il riferimento agli sci del proprio pack e un importo zero.
I rientri con codice 1 e prenotazione esplicita riconsegnano una sola riga alla
volta; ritentare lo stesso request_id non riconsegna il paio successivo.
La migrazione è ripetibile e non ricalcola le prenotazioni precedenti.

## 027 — Configurazione delle tariffe pack giornaliere

Eseguire [027_daily_pack_rates.sql](027_daily_pack_rates.sql) dopo 026. Aggiunge
sette prezzi pack a rental_rates, da pack_price_1_day a pack_price_7_plus_days.
Sono importi al giorno, come i sette prezzi singoli: null significa da configurare,
zero significa gratuito. Conserva tutti i prezzi e i noleggi esistenti; le nuove
colonne partono vuote. Gli aggiornamenti mantengono le RLS del listino e sono
consentiti solo agli operatori configurati. Il database permette prezzi pack
soltanto per i gruppi di sci e snowboard. La query è ripetibile.

Questa migrazione prepara il listino. Per applicare i prezzi pack al preventivo
e alla conferma giornaliera eseguire anche 028_apply_daily_packs.sql.

## 028 — Applicazione automatica dei pack giornalieri

Eseguire [028_apply_daily_packs.sql](028_apply_daily_packs.sql) dopo 027. Aggiorna
la conferma atomica giornaliera: sci + scarponi da sci e snowboard + scarponi da
snowboard diventano pack, abbinati nell'ordine di inserimento senza riutilizzare
scarponi. Il prezzo pack del gruppo dell'attrezzo e della durata scelta è al
giorno e viene moltiplicato per tutti i giorni; 7+ vale per l'intera durata.
Scarponi inclusi a zero, con riferimento all'attrezzo del pack. I singoli restano
a tariffa singola. Un paio di bastoncini per ogni sci rimane gratuito anche senza
scarponi; eventuali paia in più restano a tariffa e con rientri separati.

Una tariffa pack mancante blocca la conferma senza scritture parziali. Sconti
albergo/promozioni, acconti, disponibilità e idempotenza mantengono le regole
esistenti. I noleggi salvati conservano prezzi e abbinamenti storici. La query è
ripetibile e non modifica le tariffe stagionali.
