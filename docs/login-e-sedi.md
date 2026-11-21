# Login e scelta della sede

Sono collegati login, profilo operatore, sedi e [magazzino noleggio](magazzino-noleggio.md).
Dashboard, storico, magazzino vendita e rientri continuano a mostrare dati dimostrativi.

## 1. Configurazione Supabase

Aprire il progetto in Supabase e il pannello **Connect**: contiene il Project URL
(`https://PROJECT_REF.supabase.co`) e la chiave pubblica. La chiave si trova anche in
**Settings > API Keys > Publishable key**. Si può usare anche la chiave anon legacy.

Non usare la password PostgreSQL, un URL del dashboard o la chiave service_role/secret.

Compilare `backend/.env`, già predisposto (escluso da Git):

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=CHIAVE_PUBBLICA
CORS_ORIGINS=["http://localhost:5174","http://127.0.0.1:5174"]
```

Compilare `frontend/.env` con lo stesso progetto e la stessa chiave pubblica:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=CHIAVE_PUBBLICA
VITE_API_URL=http://127.0.0.1:8001/api/v1
```

Riavviare i processi dopo le modifiche ai file di configurazione.
`DATABASE_URL` non è necessaria per questi endpoint: il repository usa la Data API
Supabase con il token dell'utente e rispetta le policy RLS. La connessione SQLAlchemy
resta predisposta per il successivo sviluppo, non viene usata da login e sedi.

## 2. Accessi alle tabelle esistenti

Le tabelle già create nel progetto sono:

- `operator_profiles`: `id` (UUID di `auth.users`), `created_at`, `name`.
- `locations`: `id`, `name`.
- `operator_locations`: `operator_id`, `location_id`.

Eseguire il contenuto di
[`backend/sql/001_operator_read_policies.sql`](../backend/sql/001_operator_read_policies.sql)
nel **SQL Editor** del proprio progetto Supabase. Lo script attiva le regole di sola
lettura e non inserisce o modifica profili, sedi o collegamenti.

L'utente autenticato può leggere soltanto il proprio profilo, i propri collegamenti
e le sedi assegnate. Non può modificare questi collegamenti dal browser.
L'assegnazione delle sedi rimane gestita dal responsabile tramite Supabase.

È necessario che l'account Auth abbia già il profilo e almeno un collegamento in
`operator_locations`. Senza questi dati il login Auth può riuscire ma il gestionale
mostra un messaggio di configurazione incompleta e non apre le pagine protette.

## 3. Avvio

Dalla radice:

```sh
npm install
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm run dev
```

Su Windows usare `backend\.venv\Scripts\python.exe` per il comando Python.

Aprire http://127.0.0.1:5174/login e usare l'account già creato in Supabase Auth.
Il cambio sede è nella sidebar, sotto il logo, anche in modalità compressa e nel menu mobile. Il pulsante di uscita è a destra.

## Flusso e file

1. Il frontend effettua il login con il client ufficiale Supabase.
2. Supabase gestisce la persistenza della sessione e il rinnovo del token.
3. FastAPI riceve il token e verifica l'utente tramite `/auth/v1/user`.
4. Il router chiama il service; il repository legge profilo e sedi con lo stesso token.
5. `GET /api/v1/me` restituisce profilo e sedi autorizzate.
6. `GET /api/v1/me/locations/{id}` verifica nuovamente l'accesso quando si cambia sede.

File principali:

- Backend: `dependencies/auth.py`, `api/routers/operator.py`,
  `services/operator_service.py`, `repositories/operator_repository.py`,
  `schemas/operator.py`.
- Frontend: `auth/AuthProvider.tsx`, `auth/RequireAuth.tsx`, `lib/supabase.ts`,
  `lib/api.ts`, `pages/login/LoginPage.tsx`, `components/layout/LocationSelector.tsx`.

La sede attiva è ricordata in `sessionStorage`, separatamente per scheda del browser
e utente. Un ID salvato viene accettato soltanto se compare nelle sedi restituite
dal backend. Un cambio negato lascia attiva la sede precedente.
Uscire chiude la sessione corrente, senza disconnettere gli altri computer.

Cambiare sede reimposta lo stato locale delle pagine. Il magazzino noleggio carica
soltanto gli esemplari della nuova sede, dopo una verifica del collegamento utente–sede
sul backend. Le pagine dimostrative mostrano ancora gli stessi esempi nelle varie sedi.

## Verifiche

```sh
npm run test --workspace frontend
npm run build
```

Dalla cartella `backend`:

```sh
.venv/bin/python -m pytest
```

I test usano servizi simulati, senza leggere o modificare dati reali Supabase.
La verifica sul progetto reale richiede configurazione dei due `.env` e applicazione
delle policy SQL; non è eseguita automaticamente.

Riferimenti ufficiali:
[API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
