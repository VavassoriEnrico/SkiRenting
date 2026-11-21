# Frontend SkiRenting

React, TypeScript e Vite. Layout ispirato a Clubly `web-superadmin`, con sidebar
blu notte comprimibile, accenti viola e menu mobile.
La lettera S è un segnaposto per il futuro logo.
Il login usa Supabase Auth; profilo e sedi provengono da FastAPI. Configurare
`frontend/.env` e `backend/.env` e applicare le policy SQL seguendo
[login e sedi](../docs/login-e-sedi.md). La sede si cambia nella sidebar, sotto il logo.
La Dashboard riprende le sezioni e le card pastello della versione Clubly fornita
nello ZIP. Noleggi, attrezzatura, clienti, incassi e grafici usano esclusivamente
dati dimostrativi in `src/pages/dashboard/demo-data.ts`.
Il selettore del periodo aggiorna gli incassi e il grafico dei noleggi in locale.
Analytics (`/analytics`) contiene un segnaposto: metriche e report sono ancora da definire.
Storico noleggi (`/noleggi`) presenta solo prenotazioni dimostrative concluse o annullate,
con ricerca e filtro per stato. Le prenotazioni attive e future sono escluse dallo storico.
Non sono ancora presenti creazione, modifica o salvataggio delle prenotazioni.
Magazzino noleggio (`/materiale-noleggio`) e Magazzino vendita (`/materiale-vendita`)
contengono inventari dimostrativi distinti, con ricerca e filtri per categoria:
Sci, Snowboard, Scarponi, Bastoncini, Casco, Maschere, Kit ARTVA e Ciaspole.
Le quantità sono raggruppate per modello e misura; tariffe e prezzi sono esempi.
Nel magazzino vendita le colonne cambiano per categoria: vista generale con tipo,
marca, modello, quantità e prezzo; sci/snowboard con tipo e lunghezza; scarponi con
millimetri, taglia scarpe e taglia in centimetri; bastoncini con marca e altezza;
casco con taglia e colore; maschere, kit ARTVA e ciaspole con marca e modello.
Ogni riga raggruppa una variante, ma gli esemplari hanno codici distinti consultabili
nel popup. Le quantità derivano dal numero di codici presenti.
Sci, tabella principale: marca, modello, tipo, lunghezza, quantità e prezzo.
Snowboard, tabella principale: marca, modello, tipo, lunghezza, quantità e prezzo.
In queste due categorie i codici univoci sono mostrati solo nel popup, insieme
a marca, modello, tipo, lunghezza, raggio, quantità e prezzo. Il raggio è espresso
in metri e i valori presenti sono dimostrativi.
Il dataset vendita è in `src/pages/inventory/sale-inventory.ts`.
Entrambi i magazzini si aprono sulla categoria Sci; il selettore mostra solo
le otto categorie, senza la vista Tutto il materiale.
In entrambi i magazzini, un clic sulla riga o sul pulsante Scheda apre il dettaglio
in sovraimpressione. La scheda è consultabile e mostra i dati dimostrativi esistenti;
i contenuti specifici delle categorie vengono definiti progressivamente.
Vendite (`/vendite`) contiene uno storico dimostrativo con ricerca cliente (nome,
cognome, email e cellulare), filtro per materiale e popup di dettaglio. I download
generano PDF facsimile: ricevuta per vendita e riepilogo di tutto lo storico,
indipendentemente dai filtri. I metodi di pagamento mostrati sono esempi da confermare.
La sidebar separa Panoramica, Storico, Operatività e Magazzino. Lo storico non
contiene comandi di creazione o modifica; restano disponibili dettagli e download.
Operatività contiene `/operativita/noleggi` e `/operativita/vendite`: pagine predisposte
con i passaggi dei flussi, ancora da implementare. Creazione, salvataggio clienti,
movimenti di magazzino, pagamenti e invio email non sono implementati.
Rientri (`/operativita/rientri`) mostra noleggi attivi con materiale da restituire,
ricerca per cliente/email e codici noleggio/materiale, filtri temporali e per rientri
parziali, e una scheda con gli esemplari rientrati o ancora in consegna.
La data di riferimento dimostrativa è esplicita (6 novembre 2026).
Il pulsante Registra rientro è disabilitato; nessun dato o disponibilità viene modificato.
I requisiti raccolti sono conservati in [`../docs/requisiti.md`](../docs/requisiti.md).

## Struttura

```text
src/
├── app/                   # Applicazione e routing
├── auth/                  # Sessione, profilo, sedi e protezione delle pagine
├── lib/                   # Client Supabase e richieste FastAPI
├── components/layout/     # Layout, sidebar e header condivisi
├── components/ui/         # Card statistiche riutilizzabili
├── config/navigation.ts   # Voci della sidebar
├── pages/dashboard/       # Dashboard
├── pages/analytics/       # Spazio per le future analisi
├── pages/rentals/         # Prenotazioni di noleggio dimostrative
├── pages/inventory/       # Inventari noleggio e vendita, categorie condivise
├── pages/sales/           # Storico vendite, dettagli e PDF dimostrativi
├── pages/operations/      # Pagine predisposte per i futuri flussi operativi
├── pages/returns/         # Elenco e schede rientri dimostrativi
└── styles/global.css      # Stili e variabili visive
```

## Comandi dalla radice del progetto

```sh
npm install
npm run dev:frontend
npm run typecheck
npm run build
npm run test --workspace frontend
```

Frontend / login: http://127.0.0.1:5174/login

`npm run dev` avvia anche il backend, con processi separati.
Solo login, profilo e sedi sono collegati: tutte le altre pagine usano dati dimostrativi.
Per distribuire la SPA, configurare l'hosting per servire `index.html` anche su
`/dashboard` e sulle altre future rotte del frontend.
