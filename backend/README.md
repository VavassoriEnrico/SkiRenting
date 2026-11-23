# Backend SkiRenting

Base FastAPI con SQLAlchemy e migrazioni Alembic per PostgreSQL su Supabase.
Richiede Python 3.11 o successivo.

## Avvio locale

Eseguire dalla cartella `backend`:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8001
```

Su Windows usare `py -m venv .venv`, `.venv\Scripts\Activate.ps1` per attivare
l'ambiente in PowerShell e `Copy-Item .env.example .env` per copiare la configurazione.

- Swagger: http://127.0.0.1:8001/docs
- OpenAPI: http://127.0.0.1:8001/openapi.json
- Health: http://127.0.0.1:8001/api/v1/health

L'avvio e la health funzionano senza credenziali. La health verifica solamente
che l'API risponda. La connessione al database viene creata al primo utilizzo.

## Organizzazione

```text
app/
├── main.py             # Creazione applicazione e middleware
├── api/
│   ├── router.py       # Registrazione router sotto /api/v1
│   └── routers/        # Endpoint HTTP
├── core/               # Configurazione condivisa
├── dependencies/       # Dipendenze FastAPI: autenticazione, client Supabase e sessione DB
├── db/                 # Base ORM, engine e session factory
├── models/             # Tabelle e relazioni SQLAlchemy
├── schemas/            # Contratti Pydantic di ingresso e uscita
├── repositories/       # Query al database
└── services/           # Regole applicative e transazioni
migrations/             # Migrazioni Alembic versionate
tests/
├── unit/
└── integration/
```

Flusso: router → servizio → repository → database.

## Elenco clienti

`GET /api/v1/customers` richiede il token Supabase, un profilo operatore e almeno
una sede assegnata. Legge `customers` con il token dell'utente e le policy RLS
di `sql/006_customers.sql`. L'anagrafica è condivisa tra tutte le sedi.

La risposta contiene solo ID, nome, cognome, email, telefono e note; non espone
il percorso dei documenti. Il repository legge tutte le pagine ordinate per
cognome, nome e ID, senza fermarsi al limite di una richiesta Supabase.
Per ora la ricerca avviene nel frontend sull'elenco completo. Lo storico delle
prenotazioni del singolo cliente non è ancora implementato.

`POST /api/v1/customers` registra un cliente e restituisce la sua scheda con ID
(201). Richiede gli stessi accessi della lettura e usa il token dell'operatore
con le policy INSERT di 006, senza nuove query o chiavi segrete. Nome e cognome
sono obbligatori; email, cellulare e note sono facoltativi. Nomi e recapiti non
sono univoci: gli omonimi vengono selezionati dall'operatore, non uniti automaticamente.
Non accetta albergo, ID scelti dal browser o riferimenti a documenti non caricati.

File dedicati: `api/routers/customers.py`, `services/customer_service.py`,
`repositories/customer_repository.py`, `schemas/customer.py`.

I router validano le richieste con gli schemi e chiamano i servizi.
I servizi coordinano repository e transazioni: una singola operazione di noleggio
deve riuscire o fallire interamente. I repository non eseguono commit.

Per aggiungere una funzionalità, creare i file corrispondenti nei vari livelli
(per esempio `customers.py`), importare i modelli in `app/models/__init__.py`
e registrare il router in `app/api/router.py`.

## Database e migrazioni

Configurare `DATABASE_URL` in `.env` con i parametri ottenuti da Supabase > Connect.
Usare `postgresql+psycopg://` e una connessione adatta a migrazioni
(diretta oppure session pooler). Non inserire credenziali nel repository.

Dopo aver definito i primi modelli, dalla cartella `backend`:

```sh
alembic revision --autogenerate -m "create initial tables"
# Controllare la migrazione generata prima di applicarla.
alembic upgrade head
```

Non vengono create o modificate tabelle all'avvio. Per ora non esistono modelli
di dominio o migrazioni iniziali: lo schema sarà definito con i requisiti.
Su un progetto Supabase che contiene già altre tabelle, delimitare lo schema gestito
prima di usare l'autogenerazione, per evitare proposte di rimozione di tabelle estranee.

## Accessi e separazione dei dati

Gli endpoint `/api/v1/me` e `/api/v1/me/locations/{id}` richiedono il token Supabase.
Il backend verifica l'utente con Supabase Auth e legge profilo e sedi tramite un
repository che usa la Data API con il token dell'utente. Le policy RLS limitano
le letture al profilo e alle sedi autorizzate. La health rimane pubblica.

Configurare `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` in `.env` e applicare
`sql/001_operator_read_policies.sql` alle tre tabelle già create in Supabase.
Per questi endpoint non serve `DATABASE_URL`; non sono usati modelli SQLAlchemy
né credenziali amministrative. I futuri endpoint operativi dovranno verificare
ogni volta l'appartenenza alla sede, senza fidarsi dell'ID ricevuto dal frontend.
Istruzioni complete: [login e sedi](../docs/login-e-sedi.md).

Una connessione SQLAlchemy diretta non eredita il token dell'utente Supabase.
I filtri per azienda/sede e l'eventuale contesto PostgreSQL per RLS devono essere
implementati esplicitamente, usando un ruolo database con privilegi appropriati.

## Controlli

```sh
ruff check .
ruff format --check .
```

Le cartelle dei test sono pronte; aggiungere test unitari per regole di business
e test di integrazione per API, isolamento dei dati e transazioni quando implementati.
I test di autenticazione e autorizzazione presenti si eseguono con `python -m pytest`.

## Riepilogo prezzi del noleggio

`POST /api/v1/locations/{id}/rental-quote` riceve date, ID degli esemplari e
albergo facoltativo. Verifica accesso alla sede, posizione e abilitazioni del
materiale e albergo attivo. Legge tariffe e sconto dal database: il browser non
può proporre prezzi o percentuali. Non sono introdotte scritture.

Il conteggio include entrambi i giorni: stesso giorno = 1, dal 1 al 3 = 3.
Il calcolo usa date senza conversioni orarie, indipendenti dall'ora legale.
Da 7 giorni in poi si applica la fascia 7+ a tutti i giorni. Gli importi usano
Decimal; il totale scontato viene arrotondato ai centesimi con ROUND_HALF_UP,
e lo sconto in euro è la differenza tra subtotale e totale. I Decimal vengono
serializzati come stringhe JSON, formattate in euro dal frontend.

Tariffe null o assenti producono righe da configurare e totale null; zero è
invece un prezzo gratuito valido. Servono le query già preparate per alberghi
e listino, senza nuove migrazioni. Il riepilogo non salva prenotazioni o pagamenti
e non riserva materiale: le sovrapposizioni sono controllate nella conferma atomica.
Test di calcolo/API/frontend verificano fasce,
giorni inclusivi, sconti, arrotondamenti, tariffe mancanti e selezioni obsolete.

## Conferma del noleggio

`POST /api/v1/locations/{id}/rental-bookings` richiede 012 e salva tramite una sola
funzione SQL prenotazione, articoli, prezzi e pagamento facoltativo. I prezzi sono
riletti nel database e confrontati con il totale accettato nel riepilogo. La funzione
blocca gli esemplari in ordine, verifica sede, abilitazioni e sovrapposizioni inclusive;
un articolo ancora consegnato/non rientrato resta bloccato anche dopo la fine prevista.
Lo stesso lock coordina assegnazioni e trasferimenti. Tariffe e sconto vengono bloccati
in lettura durante la conferma. Le copie di prezzi e dati del materiale restano nello storico.

Il pagamento ricevuto indica importo positivo, metodo e data/ora locale Europe/Rome;
il service la converte in un istante UTC. Le ore inesistenti al cambio primaverile
sono rifiutate; nell'ora ripetuta autunnale si usa la prima occorrenza. Paga dopo e
totale zero non creano righe pagamento. Sono soltanto registrazioni manuali.

Il browser genera un ID per la bozza; ritentare la stessa richiesta restituisce il
noleggio già salvato senza duplicare gli incassi. Cambiare il contenuto di una
richiesta già confermata con lo stesso ID produce un conflitto esplicito. Nessun
permesso di scrittura diretta sulle tabelle è stato aggiunto agli operatori.

`backend/.venv/bin/python scripts/check_booking_confirmation.py`, dalla radice,
esegue i test backend in un cluster PostgreSQL locale effimero, creato e rimosso
dallo script. Richiede initdb/pg_ctl e accesso alla memoria condivisa del sistema.
Non usa Supabase o credenziali del progetto. Verificati rollback, acconti/saldo,
idempotenza, accessi e concorrenza reale tra due conferme dello stesso esemplare.

## Consultazione noleggi

`GET /api/v1/locations/{id}/rental-bookings` restituisce tutti gli stati per default
(`scope=all`); `scope=history` restringe a conclusi e annullati.
`GET /api/v1/locations/{id}/rental-bookings/{booking_id}` restituisce la scheda completa.
Entrambi verificano l'accesso alla sede; un noleggio di un'altra sede non è leggibile.
Il repository pagina testate, articoli e pagamenti separatamente, senza troncare
le righe ai limiti di risposta Supabase. Totale e residuo derivano dagli importi
salvati e dallo sconto della prenotazione, senza usare il listino corrente.
Il dettaglio espone cliente, albergo, note, copie storiche del materiale e pagamenti
con data effettiva e di registrazione; non espone percorsi dei documenti cliente.
Sono letture sulle tabelle esistenti, senza nuove migrazioni o scritture.

La selezione nel nuovo noleggio usa `GET /api/v1/locations/{id}/rental-inventory`
con `available_only=true` e, quando complete, `starts_on`/`ends_on`. Senza date
si considera oggi in Europe/Rome; date incomplete o invertite sono rifiutate.
Il filtro applica lo stesso criterio della conferma SQL: esclude righe non rientrate
con consegna registrata o prenotazione attiva, e prenotazioni confermate/in
preparazione sovrapposte al periodo. Rientri già registrati e prenotazioni annullate
senza consegna non bloccano l'esemplare. Le assegnazioni sono lette in pagine
e blocchi di ID, usando JWT/RLS esistenti. Un errore di lettura blocca la ricerca,
senza mostrare articoli come disponibili. Il magazzino senza filtro resta completo.
Non serve una nuova query SQL; il controllo atomico alla conferma resta necessario
per prenotazioni concorrenti.

## Rientri previsti oggi

`GET /api/v1/locations/{id}/rental-returns` restituisce `due_on` e `bookings`:
solo noleggi con `ends_on` uguale a oggi in Europe/Rome, stato confirmed/preparing/active/completed
e almeno una riga materiale. Sono incluse le prenotazioni confermate
anche senza `delivered_at`, perché la consegna separata non è ancora implementata.
Le righe già rientrate restano nel dettaglio per distinguere i rientri parziali;
un noleggio con tutte le righe rientrate resta visibile, distinguendo saldo pendente
e completamento. Noleggi senza materiale o annullati non compaiono.
La data viene calcolata dal server, senza dipendere dal fuso del computer dell'operatore.
Sede e JWT vengono verificati prima delle letture; testate e righe vengono paginate
separatamente; i pagamenti servono a calcolare il saldo, senza effettuare scritture.
Si usano le tabelle e le policy esistenti di 007, senza nuove migrazioni.

## Registrazione rientro per codice

Eseguire `sql/013_register_rental_return.sql` dopo 012. L'endpoint
`POST /api/v1/locations/{id}/rental-returns` accetta `request_id` UUID e `code`,
chiama una RPC atomica e restituisce il dettaglio aggiornato della prenotazione.
La RPC verifica operatore/sede, blocca esemplare e prenotazione, cerca una sola
assegnazione aperta già iniziata e registra data/ora e operatore del rientro.
Codici non presenti, future prenotazioni e assegnazioni ambigue vengono rifiutati.
Lo stesso request_id con gli stessi dati può essere ritentato senza aggiornare
nuovamente il rientro; i dati cambiati con lo stesso ID sono rifiutati.
La prenotazione passa a completed soltanto quando tutto è rientrato e pagato;
altrimenti resta active. Nessun pagamento viene creato. Il materiale rientrato
è di nuovo disponibile anche quando il cliente deve ancora saldare.
La query permette returned_at senza delivered_at, per non inventare consegne:
quando entrambe esistono, la cronologia resta vincolata. Gli operatori non possono
scrivere direttamente nelle tabelle o nel registro interno delle richieste.

## Saldo dei rientri

Eseguire `sql/014_register_rental_payment.sql` dopo 013. L'endpoint
`POST /api/v1/locations/{id}/rental-bookings/{booking_id}/payments` accetta
payment_id UUID, amount, payment_method, paid_at_local e notes facoltative.
Riutilizza la validazione dei pagamenti e la conversione dell'ora italiana della
conferma noleggio, rifiutando ore inesistenti al cambio legale.
La RPC verifica sede e operatore, blocca la prenotazione e ricalcola il residuo
con gli importi storici e lo sconto salvato. Accetta importi positivi fino al saldo
solo con tutto il materiale rientrato. Registra una riga in rental_payments,
conservando gli acconti precedenti; un saldo completo imposta completed.
Lo stesso payment_id con gli stessi dati restituisce il risultato senza duplicati,
anche dopo completed; dati diversi con lo stesso ID vengono rifiutati.
Il lock serializza pagamenti concorrenti e rientri; le scritture dirette degli
operatori restano vietate. Nessuna transazione verso cassa o banca viene eseguita.

Le letture dello storico includono `returned_item_count`, calcolato dalle righe
con returned_at valorizzato. Il frontend distingue così un noleggio ancora con
materiale fuori da un rientro completo in attesa di saldo, senza cambiare gli stati
salvati o aggiungere colonne al database.

Il saldo è registrabile anche se la prenotazione è già completed: il vincolo
riguarda il materiale completamente rientrato e il residuo positivo. I noleggi
annullati restano esclusi. Rieseguire la versione aggiornata della query 014 se
compare il vecchio errore «già concluso o annullato»; la modifica non cambia i dati.

## Campi anagrafici per i vecchi clienti

Eseguire `sql/015_customer_profile_fields.sql` dopo 006; non rieseguire la creazione
iniziale di customers. La migrazione aggiunge quattro colonne nullable: birth_date,
skill_level (beginner/intermediate/expert), language e country_code (due lettere
maiuscole). Non modifica i clienti esistenti, né policy o permessi. È rieseguibile.
Nome e cognome restano obbligatori per le nuove registrazioni. POST /customers
accetta i nuovi campi, normalizza codici/livello, converte stringhe vuote in null
e rifiuta date future e valori non validi. Le date sono serializzate YYYY-MM-DD.
Le letture clienti e i dettagli noleggio includono i campi, senza esporre document_path.
Se manca la migrazione, l'API indica esplicitamente il file 015 da applicare.

Dal CSV clienti_nel_periodo.csv sono state rilevate 5.860 righe e 14 colonne utili.
L'importazione non è ancora eseguita. Mappa prevista: data_nascita -> birth_date
(formato origine DD/MM/YYYY), r_capacita -> skill_level (PRINCIPIANTE/INTERMEDIO/ESPERTO),
lingua -> language, stato -> country_code. L'età non si memorizza.
I riepiloghi tot_articoli_noleggiati/pagato/visite dovranno essere conservati
separatamente come dati legacy del periodo, senza inventare noleggi o incassi.
Non si importano ancora rentall_privacy e stagionale come attributi cliente:
il loro significato resta da chiarire. Le 401 righe prive di nome o cognome e le
22 con un nome o cognome numerico vengono conservate come dati storici, secondo
la scelta dell’utente, senza scarti o fusioni automatiche. Il file non contiene un ID cliente di origine.

## Importazione effettiva dei vecchi clienti

L'utente ha scelto di conservare tutte le righe, comprese quelle con nomi vuoti,
numerici o ripetuti. 016_legacy_customer_import.sql aggiunge is_legacy (solo
amministratori possono impostarlo) e consente nomi vuoti solo alle righe storiche.
Le nuove registrazioni mantengono i vincoli API e database su nome/cognome.

Dalla radice: `python3 scripts/customer_import/generate.py /percorso/clienti_nel_periodo.csv`.
Il generatore non si collega a Supabase. Produce in `private/customer-imports/`
(ignorato da Git) import_clienti.sql e riepilogo.json; i file contengono dati privati.
Eseguire tutto import_clienti.sql nel SQL Editor: include 015, 016 e l'inserimento
in una transazione. Non eseguire spezzoni separati. In caso di errore si annulla
l'intera importazione. Il risultato finale confronta righe attese e clienti importati.

Ogni riga CSV diventa un cliente distinto, senza unire omonimi o clienti già presenti.
Nomi, email e telefoni non vuoti conservano il contenuto originale; i telefoni
restano testo con gli zeri iniziali. I nomi vuoti restano stringhe vuote, i recapiti
vuoti diventano null. Date e livelli vengono adattati ai tipi della tabella.
Tutte le celle originali, anche quelle vuote, sono conservate in customer_import_rows,
collegate al cliente e al lotto. Privacy, stagionale, età e riepiloghi economici
restano nell'archivio amministrativo e non creano prenotazioni o pagamenti.
L'archivio non è leggibile dagli operatori o dagli anonimi.

Gli UUID dipendono dall'hash del file e dall'ordine delle righe: rieseguire lo stesso
file non duplica clienti e non sovrascrive successive correzioni manuali. Questo
non è un sistema di fusione tra esportazioni differenti: un file modificato ha un
hash diverso e richiede una valutazione prima di generare una nuova importazione.
L'importazione Supabase rimane manuale: generare i file non carica i clienti.

Se il SQL Editor segnala «Query is too large», usare i file numerati nella cartella
`private/customer-imports/blocchi/`, uno per volta, in ordine. Il generatore produce
blocchi da 500 righe e un singolo file compatto. Nel formato compatto le intestazioni
CSV sono condivise e i valori originali restano identici. La prima parte include
le migrazioni; ogni parte è una transazione indipendente e può essere ritentata.
L'ultima parte verifica il totale atteso. Non incollare i blocchi tutti insieme.
Un'interruzione non annulla i blocchi già completati: riprendere dal file mancante,
oppure rieseguire tutti i blocchi senza creare duplicati. Il file compatto e i blocchi
usano gli stessi ID, quindi si possono alternare senza duplicazioni.

## Modifica e cancellazione clienti

Eseguire `sql/017_customer_management.sql` dopo 015 e 007. Aggiunge deleted_at e
la RPC di cancellazione logica, senza rimuovere clienti o collegamenti esistenti.
`PATCH /api/v1/customers/{id}` aggiorna solo i campi presenti nella richiesta;
flag amministrativi e documento non sono modificabili tramite questo endpoint.
Nomi vuoti restano ammessi solo sulle righe is_legacy (vincolo database).
`DELETE /api/v1/customers/{id}` richiede conferma nel frontend e chiama una RPC
riservata agli operatori con almeno una sede. I ritentativi sono idempotenti.
I clienti eliminati non compaiono nell'anagrafica né nella selezione per nuovi
noleggi, ma rimangono leggibili dallo storico e collegati a pagamenti/importazione.
Un trigger blocca nuove prenotazioni con un cliente già eliminato, anche da una
bozza rimasta aperta. Il lock del cliente coordina cancellazione e nuova prenotazione.
Le scritture REST sui flag is_legacy/deleted_at e DELETE diretto restano vietati.

## Prenotazioni per cliente

`GET /api/v1/customers/{id}/bookings` restituisce il cliente, booking_count e una
lista con numero, sede, inizio/fine, totale e pagato. L'anagrafica è condivisa:
sono incluse tutte le sedi assegnate all'operatore, indipendentemente dalla sede
selezionata nel frontend. Profilo/sedi vengono verificati prima delle letture;
le query filtrano esplicitamente customer_id e le sedi autorizzate, oltre a RLS.
I clienti mancanti/eliminati restituiscono 404. La lista include tutti gli stati,
in ordine decrescente di data di inizio, fine e numero prenotazione.
Testate, materiale e pagamenti vengono letti separatamente e con paginazione,
riutilizzando gli importi storici e lo sconto salvato per evitare somme duplicate.
Il conteggio non usa visite/pagato del CSV legacy e non inventa prenotazioni.
Non richiede migrazioni o scritture: usa le tabelle e gli indici esistenti.

## Riparazioni operative

Dopo la query 019, `GET /locations/{id}/repairs` restituisce gli interventi aperti
della sede, con codice, caratteristiche del materiale, tipo, invio e note.
`POST /locations/{id}/repairs` accetta repair_id, code, repair_type e notes;
`POST /locations/{id}/repairs/{repair_id}/complete` accetta rental_inventory_id.
Le mutazioni passano da RPC con controllo sede e lock dell'esemplare. Nessuna
scrittura diretta alle riparazioni viene concessa agli operatori.
L'inventario per la selezione (`available_only=true`) include open_repair:
maintenance con intervento aperto può essere scelto solo dopo il consenso che
chiude la riparazione. Manutenzione senza intervento, materiale disabilitato,
perso/venduto e articoli già occupati restano bloccati. I ritentativi della chiusura
non cambiano la data e non chiudono altri interventi aperti successivamente.
Per l'elenco sono usate letture paginate e filtri server per la sede corrente.

## Magazzino generale

`GET /api/v1/rental-inventory` restituisce categorie, sedi autorizzate e singoli
esemplari da noleggio, ognuno con `location: {id, name}` e `open_repair` eventuale.
Verifica il profilo e le assegnazioni dell'operatore a ogni richiesta, applica
il filtro sulle sedi anche nella lettura REST e usa letture paginate (incluse
le riparazioni aperte). Non dipende dalla sede selezionata nel frontend e non
esegue scritture. Il frontend aggrega gli esemplari per caratteristiche fisiche;
identità, sede e dati di ciascun codice restano separati nel database.
Non richiede nuove migrazioni oltre a quelle già usate dal magazzino/riparazioni.

`GET /api/v1/sale-inventory` fornisce il magazzino generale vendite dalle giacenze
`public.sale_inventory`, limitate alle sedi dell'operatore e a quantità positive.
Restituisce categorie, sedi e righe con id, variante completa, sede, quantità,
prezzo unitario nullable e note. Usa lo stesso contesto JWT e letture paginate;
non legge materiale da noleggio né riparazioni e non effettua scritture.
Richiede la tabella già prevista dalla migrazione 002, senza nuove query.
Il modello attuale non contiene codici per singolo pezzo, né righe di storico vendite.

La lettura completa del magazzino noleggio di una sede include `summary` con
`currently_rented` (esemplari distinti impegnati oggi secondo la disponibilità,
compresi i rientri ancora mancanti) e `currently_in_repair` (stato maintenance o
intervento aperto). Esclude i pezzi già restituiti dai noleggiati e non conta le
sole prenotazioni future. I conteggi precedono i filtri della tabella frontend.
La lettura `available_only=true` mantiene il percorso di selezione senza riepilogo.


`GET /api/v1/locations/{location_id}/rental-inventory/{item_id}` verifica sede e
appartenenza corrente dell'esemplare, quindi restituisce `item` e `statistics`
(`rental_count`, `repair_count`, `rentals_since_last_repair`, `last_repair_at`).
Conta prenotazioni distinte già iniziate, non annullate, anche concluse e rientrate;
le sole prenotazioni future non aumentano il totale. Conta interventi completati,
non aperti o annullati. Per il confronto cronologico usa la consegna se nota,
altrimenti il momento più recente tra creazione prenotazione e inizio giornata
italiana della data iniziale. Questo distingue la conferma di un nuovo noleggio
dalla riparazione conclusa prima della conferma nello stesso giorno.
Senza interventi conclusi, il conteggio dall'ultima riparazione è il totale.
Le letture sono paginate e protette dalle RLS esistenti: comprendono lo storico
accessibile all'operatore anche nelle altre sedi, senza filtro sulla sede storica.
L'endpoint non scrive dati e non richiede nuove migrazioni. I vecchi noleggi non
ancora importati non partecipano ai conteggi.
