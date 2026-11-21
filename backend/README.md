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
