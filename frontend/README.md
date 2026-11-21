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
La sidebar separa Panoramica, Anagrafica, Storico, Operatività e Magazzino. Lo storico non
contiene comandi di creazione o modifica; restano disponibili dettagli e download.
Operatività contiene `/operativita/noleggi` e `/operativita/vendite`. Nei noleggi è
attivo il primo passaggio cliente, descritto sotto; la vendita mantiene l'anteprima
del flusso. Creazione del noleggio, movimenti, pagamenti e invio email restano da implementare.
Rientri (`/operativita/rientri`) mostra noleggi attivi con materiale da restituire,
ricerca per cliente/email e codici noleggio/materiale, filtri temporali e per rientri
parziali, e una scheda con gli esemplari rientrati o ancora in consegna.
La data di riferimento dimostrativa è esplicita (6 novembre 2026).
Il pulsante Registra rientro è disabilitato; nessun dato o disponibilità viene modificato.
I requisiti raccolti sono conservati in [`../docs/requisiti.md`](../docs/requisiti.md).

Clienti (`/clienti`, in Anagrafica) usa i dati reali restituiti da FastAPI:
nome, cognome, email, telefono e note. La ricerca filtra nome, cognome, email e
telefono, ignora maiuscole e accenti e riconosce i telefoni anche senza spazi
o trattini. Consente di combinare nome e cognome in qualsiasi ordine.
I clienti sono condivisi tra le sedi. Non sono usati clienti dimostrativi:
caricamento, errore con retry, elenco vuoto e ricerca senza risultati sono distinti.
La scheda del cliente con le sue prenotazioni verrà collegata successivamente.

In `/operativita/noleggi`, scrivendo il cognome si cercano i clienti nell'anagrafica
condivisa. Tutte le corrispondenze (anche parziali, ignorando maiuscole e accenti)
mostrano nome, email e telefono per distinguere gli omonimi. Selezionare un cliente
compila i dati in sola lettura e conserva il suo ID nello stato della pagina,
senza inserimenti o modifiche all'anagrafica. «Cambia cliente» torna alla ricerca.

«Registra un nuovo cliente» è disponibile anche in presenza di omonimi: conserva
il cognome e permette di compilare nome, cellulare, email e note. «Salva nuovo cliente»
invia `POST /customers` e seleziona il cliente restituito dal backend. Il nuovo cliente
sarà visibile nell'elenco Clienti. Non salva albergo o documento e non crea ancora
una prenotazione. Il secondo passaggio è visibile fin dall'apertura della pagina, con
data di inizio, rientro previsto e albergo facoltativo, letto da `GET /hotels` con
l'opzione Nessun albergo. Entrambe le sezioni si aprono e chiudono cliccando il titolo, senza
perdere i dati compilati. Il rientro non può precedere l'inizio; le due date possono coincidere.
Date e albergo appartengono alla bozza del noleggio e non modificano il cliente;
restano compilati anche quando si cambia persona nello stesso flusso. Gli alberghi
usano gli ID reali di Supabase e non applicano sconti. Il salvataggio della prenotazione
non è ancora collegato: bozza e selezione si azzerano dopo ricaricamento o cambio sede.
Il modulo mantiene i valori su errore, blocca invii simultanei e annulla le richieste
al cambio sessione o uscita dalla pagina; una richiesta già arrivata al server può
essere stata salvata, quindi in caso di errore di connessione verificare l'anagrafica.

Il terzo passaggio «Materiale» è visibile subito e richiudibile. Legge il magazzino
reale della sede attiva con `GET /locations/{id}/rental-inventory`, già autorizzato
dal backend. Il campo codice accetta testo e invio da un lettore che emula la tastiera;
il confronto è esatto, conservando maiuscole, simboli e zeri iniziali. «Aggiungi codice»
consente anche l'inserimento manuale. Dopo l'aggiunta il campo viene svuotato e resta
pronto per il codice successivo.

La ricerca manuale filtra categoria, codice, marca, modello, misura e gruppo, con
pagine di 20 esemplari. Ogni esemplare può essere aggiunto una sola volta. Sono
selezionabili soltanto articoli attivi, noleggiabili e prenotabili; manutenzione,
dismissione e altre disabilitazioni sono mostrate senza indicare una disponibilità
per data. Gli articoli scelti mostrano codice, categoria, marca, modello e misura,
con un comando di rimozione. La sezione chiusa diventa verde quando contiene materiale.

La selezione resta nella bozza modificando cliente, date o apertura delle sezioni;
si azzera al cambio sede/sessione, uscita o ricaricamento. Non vengono creati noleggi
né modificati gli esemplari: prenotazione effettiva, disponibilità per periodo e
tariffe saranno collegati quando esisteranno le relative tabelle e regole.

Gestione (`/management`, in fondo alla sidebar sotto Amministrazione) contiene la card Alberghi, che apre
`/management/hotels`. La pagina permette di aggiungere un albergo per nome e
rimuoverlo con conferma. La rimozione disattiva la voce senza cancellare i riferimenti
delle prenotazioni passate. Riaggiungere un nome rimosso riattiva la stessa voce.
Il menu albergo dei noleggi legge solo le voci attive, senza più opzioni fisse nel codice.
Per abilitare le scritture eseguire `backend/sql/008_hotels_management.sql` dopo 007.
Eseguire poi `009_hotels_discount.sql` per la colonna `discount`. Nel modulo di
creazione si indica lo sconto percentuale (default 0); nell'elenco ogni albergo
ha un campo Sconto (%) e un pulsante Salva. La percentuale può avere due decimali
e deve essere tra 0 e 100. I valori rimangono nel campo in caso di errore.
Lo sconto viene salvato nella convenzione, ma non viene ancora applicato al
totale del noleggio: prezzi e conferma della prenotazione restano da collegare.

La card Tariffe in Gestione apre `/management/tariffe`: il listino è diviso per
tipo di materiale, con i relativi gruppi su righe e sette colonne €/giorno (1, 2,
3, 4, 5, 6, 7+ giorni). Richiede `010_rental_rates.sql`. Le righe sono già presenti
per ogni gruppo; un gruppo nuovo riceve automaticamente una riga da configurare.
Un campo vuoto viene salvato come null, distinto da zero. Ogni gruppo viene salvato
con il proprio pulsante; i valori ancora non salvati restano compilati passando
da un tipo all'altro, ma non dopo ricaricamento o uscita dalla pagina. Tutte le
sedi usano lo stesso listino. Il calcolo del nuovo noleggio sarà collegato in seguito.

Nel magazzino noleggio, la scheda di una variante mostra «Sposta sede» accanto a
ogni codice. Il modulo trasferisce un singolo esemplare verso un'altra sede
autorizzata, con conferma. Dopo il successo la scheda si chiude e il magazzino
viene ricaricato; il codice comparirà nella destinazione selezionando quella sede.
In caso di errore la scheda resta aperta con la destinazione scelta. Durante la
richiesta vengono disabilitati chiusura e ulteriori invii; il cambio sede/sessione
annulla le richieste locali. Se la connessione si interrompe, verificare la sede
effettiva prima di riprovare. Richiede `011_rental_inventory_transfers.sql`.

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
├── pages/customers/       # Anagrafica clienti reale e ricerca
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
