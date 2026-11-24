# Requisiti SkiRenting

Appunti raccolti con il cliente. Sono requisiti da sviluppare e decisioni da confermare,
non una descrizione di funzionalità già disponibili. Login, sedi e magazzino noleggio
sono collegati al backend; le altre pagine usano dati demo o segnaposto.

## Navigazione

- Panoramica: Dashboard e Analytics.
- Anagrafica: Clienti.
- Noleggi: Nuovo noleggio, Noleggi attuali e Storico noleggi.
- Vendite: Nuova vendita e Storico vendite.
- Operatività: Rientri e Riparazioni.
- Magazzino della sede selezionata: Magazzino noleggi e Magazzino vendite.
- Magazzino generale: Magazzino generale noleggi e Magazzino generale vendite.
- Amministrazione: Gestione.
- Noleggi attuali comprende prenotati, in preparazione e da riconsegnare;
  lo storico comprende conclusi, conclusi da saldare e annullati.
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
  lunghezza, marca, modello, codice.
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

## Promozioni

- Card Promozioni in Gestione, con elenco, inserimento e rimozione.
- Nome, ID e data/ora di creazione, percentuale di sconto.
- Validità alternativa: data singola, uno o più giorni ricorrenti della settimana oppure periodo Dal/Al, estremi inclusi.
- Configurazioni condivise tra le sedi; rimozione logica per preservare i record.
- Valide esclusivamente per noleggi di una giornata: data esatta, giorno della settimana o data compresa nel periodo.
- Si applica solo lo sconto più alto tra promozioni valide e albergo, senza cumulo.
- Per noleggi di più giorni valgono solo gli eventuali sconti albergo.
- Nel nuovo noleggio si possono aggiornare cellulare/email del cliente esistente,
  mantenendo nome e cognome bloccati; modifiche salvate nell'anagrafica.

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


## Controlli da fare più avanti

- Sidebar condensata: gli stagionali sono poco frequenti e condividono con i
  giornalieri Nuovo noleggio, Noleggi attuali e Storico noleggi. Nuovo noleggio
  parte da Giornaliero; gli elenchi hanno Tutti/Giornalieri/Stagionali e la scelta
  della stagione per gli stagionali. Magazzino sede e generale hanno ciascuno
  la scelta Noleggio/Vendita. Solleciti avrà una pagina distinta da Rientri in
  Operatività, da definire con l'utente prima dell'implementazione.

- Bastoncini: codice generico unico 1, condiviso fra sedi e riutilizzabile in
  noleggi giornalieri e stagionali contemporanei. Prezzo configurabile nei due
  listini; può comparire più volte nella stessa prenotazione, con una riga per
  paio. Un paio per ogni paio di sci è incluso a zero, anche senza scarponi;
  le paia in eccedenza seguono il listino. Rientro
  distinto per prenotazione, senza usare il solo codice per scegliere il cliente.

- Noleggi stagionali: nuova scheda, elenco consultabile per stagione e listino
  dedicato in Gestione. Una data di consegna globale per stagione, interpretata
  come restituzione e proposta a tutti i nuovi stagionali. Prezzi totali per
  gruppo, singolo oppure pack sci/snowboard + scarponi compatibili. I bastoncini
  sono facoltativi e inclusi solo nel pack sci.
  Riconoscimento automatico dai codici selezionati, senza scelta manuale e senza
  riutilizzare esemplari. Mantengono clienti, note, acconti, saldi e rientri del
  flusso esistente. Le prenotazioni confermate conservano date e importi storici.

- [ ] Controllare la gestione del materiale da sistemare e delle riparazioni:
  coerenza tra stato dell'articolo in magazzino (`rental_inventory.status`),
  interventi aperti in `material_repairs`, elenco Riparazioni e conteggio nella card.
  Verificare anche invio in riparazione e chiusura dell'intervento al nuovo noleggio.
- [ ] Sistemare la dashboard come ultimo intervento, dopo aver definito le altre funzionalità e i dati da riepilogare.

## Arrivi materiale vendita

- Il materiale in vendita è gestito per variante/sede/quantità, senza scansione o
  codice univoco per ciascun pezzo.
- Registrare un arrivo scegliendo tipo, categoria commerciale, marca, modello,
  caratteristiche specifiche e quantità; riusare le varianti già esistenti.
- Sommare un nuovo arrivo alla giacenza locale e mantenere separate le misure.
- Conservare data arrivo, quantità, eventuali prezzi unitari di acquisto/vendita,
  note e operatore. Lo stesso invio ritentato non deve duplicare il carico.

## Carico multiplo noleggio e cestino

- Per un arrivo di più esemplari identici compilare modello e caratteristiche una
  volta, indicare la quantità e inserire un codice diverso per ogni esemplare.
  Eventuale matricola individuale; prezzi unitari, stato e note condivisi.
- Salvare il carico in un'unica operazione: un codice errato o già presente
  annulla l'intero inserimento. Ritentativi identici non duplicano gli articoli.
- Il cestino del magazzino noleggio permette di selezionare i singoli codici:
  conserva storico e riparazioni e impedisce l'eliminazione di materiale impegnato
  o in riparazione. I codici archiviati non sono riutilizzabili.

## Consultazione dismessi e ordinamento clienti

- Gestione contiene **Articoli dismessi** per il materiale da noleggio, con codici,
  caratteristiche, sede, data quando disponibile e scheda con statistiche di
  utilizzo/riparazioni. Si riusa rental_inventory, senza spostare o duplicare righe.
- Gli operatori possono dismettere gli esemplari; storico e riferimenti restano
  conservati. La pagina include anche quelli precedentemente archiviati.
- Clienti ordinabili in entrambi i versi per cognome, nome, numero prenotazioni,
  età, email, telefono e note, applicando l'ordine prima della paginazione e
  mantenendo i dati mancanti in fondo.
