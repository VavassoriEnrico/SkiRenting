# SkiRenting

Gestionale per negozi e noleggi di sci, con accesso da più sedi.

- Frontend: React, TypeScript e Vite.
- Backend: Python e FastAPI.
- Database: PostgreSQL su Supabase, con SQLAlchemy.
- Autenticazione: Supabase Auth, con verifica FastAPI e selezione della sede.

## Preparazione

Richiede Node.js 22.12+ e Python 3.11+. Dalla radice del progetto:

```sh
npm install
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Su Windows, usare `py -m venv backend/.venv` e
`backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt`.
Se l'ambiente Python esiste già e le dipendenze sono installate, saltare quei passaggi.

## Avvio

```sh
npm run dev
```

- Frontend / login: http://127.0.0.1:5174/login
- Backend / Swagger: http://127.0.0.1:8001/docs

Il comando avvia i due processi con ricaricamento automatico; `Ctrl+C` li ferma entrambi.
Login, profilo, sedi e magazzino noleggio sono collegati al backend. Compilare `frontend/.env` e
`backend/.env` ed eseguire le policy SQL seguendo [login e sedi](docs/login-e-sedi.md).
La health e la schermata iniziale funzionano anche senza configurazione;
le altre pagine sono protette dal login. Il magazzino noleggio legge gli articoli reali
della sede selezionata; le altre pagine continuano a usare dati dimostrativi o segnaposto.
Dettagli: [magazzino noleggio](docs/magazzino-noleggio.md).

Comandi separati: `npm run dev:frontend` e `npm run dev:backend`.
Verifica TypeScript: `npm run typecheck`. Build frontend: `npm run build`.
Test frontend: `npm run test --workspace frontend`.

Documentazione: [frontend](frontend/README.md) e [backend](backend/README.md).
