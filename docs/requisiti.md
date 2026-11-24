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

- Dalla pagina Articoli dismessi si può riattivare un esemplare con conferma,
  mantenendo ID, codice, sede e storico. Torna attivo/noleggiabile/prenotabile;
  riparazioni aperte e catalogo disabilitato bloccano l'operazione.

## Lista operativa numerata — riferimento stabile

Numerazione concordata il 24 novembre 2026: conservarla per i prossimi riferimenti
in chat. **9 e 23 completati per conferma dell'utente. 6 e 7 implementati; applicare le nuove migrazioni 035 e 036.**
Le altre attività rimangono in sospeso; quelle indicate come decisioni non sono
funzionalità già approvate. Le nuove migrazioni successive alla 034 sono separate
dalla verifica già conclusa al punto 23.

1. Rivedere definitivamente la grafica del nuovo noleggio.
2. Definire preparazione e consegna effettiva del materiale e passaggi di stato.
3. Realizzare l'eventuale scheda/elenco di preparazione noleggi.
4. Preparare scheda noleggio stampabile/PDF con cliente, date, materiale, codici e importi.
5. Concordare intestazione, condizioni e spazio firma del documento.
6. **IMPLEMENTATO (migrazione 035) — Cellulare obbligatorio nel nuovo noleggio.** Un cliente storico senza numero deve essere integrato quando torna e viene selezionato per un nuovo noleggio. Nessuna modifica massiva ai clienti che non tornano. Applicare a giornalieri e stagionali.
7. **IMPLEMENTATO (migrazione 036) — Mantenere la foto documento.** Implementare caricamento e consultazione nel nuovo noleggio e nella scheda cliente; foto facoltativa in Storage privato.
8. Inserire i listini definitivi giornalieri/stagionali quando disponibili.
9. **COMPLETATO — Alberghi reali e percentuali di sconto già sistemati dall'utente.**
10. Confermare i metodi di pagamento col proprietario.
11. Provare la pistola reale in noleggi, carichi e rientri.
12. Controllare focus, Invio e scansioni rapide consecutive.
13. Uniformare minuscole/maiuscole nei campi codice.
14. Chiarire la regola del doppio scan nei rientri.
15. Verificare rientri parziali, ritardi e bastoncini generici di prenotazioni diverse.
16. Controllo complessivo della coerenza tra magazzino, riparazioni, card e chiusura al rinoleggio.
17. Caricare il materiale reale per la vendita quando disponibile.
18. Provare i moduli di carico col proprietario e confermare le caratteristiche necessarie.
19. Verificare la distribuzione reale del materiale fra Madesimo e Boscone.
20. Controllare le prenotazioni storiche senza cliente associato (22 nella prova locale).
21. Verificare i collegamenti fra materiale storico e attuale per le statistiche individuali.
22. Controllare i dati anomali storici conservati senza correzioni automatiche.
23. **COMPLETATO — Migrazioni e configurazione Supabase fino alla 034 verificate dall'utente.**
24. Definire lo schema vendita con testata e righe per più prodotti.
25. Realizzare vendita: cliente, prodotti/quantità, pagamento e conferma.
26. Scalare quantità e registrare vendita atomicamente, verificando disponibilità.
27. Collegare lo storico vendite ai dati reali.
28. Collegare ricerca, filtri e popup vendite ai record effettivi.
29. PDF della singola vendita con dati reali.
30. Riepilogo PDF di tutte le vendite.
31. Concordare dati e diciture del documento da consegnare al cliente.
32. Confermare l'eventuale ricevuta via email.
33. Realizzare i solleciti per il materiale non riconsegnato (rimandati).
34. Scegliere WhatsApp manuale o API.
35. Definire destinatari/testi, prevenzione doppi invii ed esiti dei solleciti.
36. Decidere e realizzare l'email di conferma noleggio.
37. PDF magazzino restante, per categoria e sede.
38. Concordare ulteriori esportazioni, per esempio Excel/CSV.
39. Scegliere le metriche definitive di dashboard e analytics.
40. Collegare la dashboard ai dati reali.
41. Costruire le analytics.
42. Definire filtri, confronti ed esportazioni delle analisi.
43. Stabilire attendibilità e limiti delle analisi storiche.
44. Rifinire la dashboard come ultimo intervento.
45. DA DECIDERE — Modifica di noleggi già confermati.
46. DA DECIDERE — Proroga noleggio e ricalcolo.
47. DA DECIDERE — Annullamento distinto dall'eliminazione dallo storico.
48. DA DECIDERE — Correzione/storno di pagamenti registrati per errore.
49. DA DECIDERE — Rettifiche quantità vendita dopo errori/inventario.
50. DA DECIDERE — Resi vendita.
51. DA DECIDERE — Permessi differenti fra operatori e responsabile.
52. Prova completa di giornalieri/stagionali, pack, sconti, acconti, saldi e rientri.
53. Prova di carichi, trasferimenti, riparazioni, dismissioni e riattivazioni.
54. Prova con due computer simultanei.
55. Prova di interruzioni di connessione e ritentativi.
56. Verifica macOS/Windows/Linux e schermi effettivi.
57. Pubblicazione frontend/backend e indirizzi definitivi.
58. Configurazione/verifica recupero accesso e password.
59. Backup e prova di ripristino.
60. Prestazioni con storico completo e pulizia dati di prova.
61. Aggiornare la documentazione iniziale superata.
62. Guida operativa e prova finale col proprietario.

Ulteriore richiesta dello stesso turno: dalla scheda cliente poter eliminare una
prenotazione con la stessa conferma dello storico, mantenendo aperta la scheda e
aggiornando il conteggio anche nella tabella clienti.

Stato delle richieste aggiuntive: eliminazione prenotazioni dalla scheda cliente
implementata con conferma, aggiornamento del conteggio e mantenimento del popup.
Corretto anche il conteggio utilizzi del singolo esemplare: include i noleggi
importati riconosciuti per codice, con uguaglianza case-insensitive ma simboli e
zeri iniziali preservati. Prenotazioni distinte contate una volta; data utilizzo
storica derivata dall'inizio originale, non dalla creazione dell'importazione.
L'utente ha confermato che ora il conteggio sembra funzionare.

Foto documento (punto 7): disponibile anche lo scatto dalla webcam del PC, con
anteprima, possibilità di rifare e conferma di salvataggio. Nessun audio;
caricamento file mantenuto come alternativa. Riusa Storage privato e migrazione 036.
