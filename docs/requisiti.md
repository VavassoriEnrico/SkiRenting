# Requisiti SkiRenting

Appunti raccolti con il cliente. Sono requisiti da sviluppare e decisioni da confermare,
non una descrizione di funzionalità già disponibili. Login, sedi e magazzino noleggio
sono collegati al backend; le altre pagine usano dati demo o segnaposto.

## Navigazione

- Panoramica: Dashboard e Analytics.
- Storico: Vendite e Noleggi passati, solo consultazione, ricerca, filtri e documenti.
- Operatività: funzioni per nuovi Noleggi e nuove Vendite.
- Rientri in Operatività: pagina predisposta nel frontend con dati dimostrativi;
  registrazione effettiva, scansioni e aggiornamenti del magazzino da implementare.
- Magazzino: Magazzino noleggio e Magazzino vendita.
- Scheda preparazione noleggi: prevista; collocazione e flusso da definire.

## Dati e identificazione del materiale

- Database con clienti, materiale, prenotazioni/noleggi, vendite e pagamenti.
- Due tabelle distinte per materiale da noleggio e materiale da vendita.
- Ogni esemplare fisico noleggiabile/vendibile ha un codice individuale, anche a parità
  di marca e modello. Un paio di sci o bastoncini può costituire una singola unità.
- I codici sono stringhe e conservano eventuali zeri iniziali.
- Integrazione con etichette già stampate e lettori di codici a barre;
  modello del lettore e formato dei codici da verificare.
- Categorie: sci, snowboard, scarponi, bastoncini, casco, maschere, kit ARTVA, ciaspole.
- Sci: base, intermedio, avanzato, top-race, freeride, alpinismo, freestyle;
  lunghezza, raggio, marca, modello, codice.
- Snowboard: freeride o base, codice. Altri attributi da definire.
- Scarponi: millimetri, taglia scarpe, taglia in centimetri, marca, modello, codice.
- Magazzino vendita, colonne richieste (quantità e prezzo sempre presenti):
  vista generale tipo/marca/modello; sci tipo base, intermedio, avanzato, top-race,
  freeride o alpinismo, marca, modello e lunghezza; snowboard base o freeride,
  marca, modello e lunghezza; scarponi millimetri/taglia scarpe/taglia cm/marca/modello;
  bastoncini marca/altezza; casco taglia/colore; maschere, kit ARTVA e ciaspole marca/modello.
- La vista raggruppata del magazzino vendita permette di consultare tutti i codici
  univoci degli esemplari della stessa variante. Quantità derivata dagli esemplari.
- Categorie sci: nome categoria e prezzo per giorno.

## Clienti, noleggi e pagamenti

- Scheda noleggio con nome, cognome, cellulare, email, albergo, note, foto documento.
- Ricerca dello storico per cliente.
- Storico pagamenti separato: ID, ID prenotazione, importo, data, metodo di pagamento.
- Consentire più pagamenti riferiti allo stesso noleggio.
- Metodi di pagamento effettivi da concordare.
- Gestione preparazione, consegna e rientri da definire.

## Vendite

- Storico con ricerca per nome/cognome, email o cellulare.
- Filtro per categoria del materiale venduto.
- Elenco: marca, prezzo, data, tipo di pagamento, nome e cognome acquirente.
- Popup con tutti i dati disponibili della vendita e del cliente.
- Campi richiesti: ID oggetto, prezzo, data, ID cliente, metodo di pagamento;
  ulteriori informazioni sul materiale da definire.
- Funzione vendita in Operatività: acquisire e salvare prima nome, cognome,
  cellulare ed email; selezionare poi materiale, metodo di pagamento e confermare.
- Alla conferma del pagamento, l'esemplare esce dal magazzino disponibile
  e rimane registrato nello storico vendite.
- Non eliminare i riferimenti alle operazioni passate: modalità di archiviazione,
  stato venduto e snapshot dei dati storici da progettare nel backend.
- Da definire: vendita con più articoli e relativo schema testata/righe.
- Email automatica della ricevuta opzionale, da confermare con Umbi.

## Magazzini e report

- Carico di un ordine: inserire quantità per categoria e identificare i singoli
  esemplari con i rispettivi codici.
- Vendita e aggiornamento magazzino devono avvenire come un'unica operazione coerente.
- Report PDF vendite totali e ricevuta per ogni vendita con dati cliente.
- Report PDF magazzino restante, suddiviso per categorie, per i magazzini pertinenti.
- Altri report e analisi da concordare.

## Contesto

- Accesso da più noleggi distanti e da macOS, Linux e Windows tramite browser.
- React/TypeScript, backend Python/FastAPI e PostgreSQL su Supabase.
- Aziende/sedi, ruoli e separazione dei dati da definire prima del backend operativo.
