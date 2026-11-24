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
Storico noleggi (`/noleggi`) legge tutti i noleggi reali della sede selezionata,
compresi quelli prenotati e attivi, con ricerca per cliente, email, telefono o numero,
filtro per stato e periodo (sovrapposizione inclusiva), e paginazione.
Il popup mostra cliente, albergo, note distinte, materiale con codici e prezzi salvati,
consegne/rientri registrati, pagamenti con data/ora, sconto, totale, pagato e residuo.
Gli stati usano badge distinti: blu prenotato, viola in preparazione, rosso
materiale da restituire, giallo concluso con saldo pendente, verde concluso e saldato,
grigio annullato. Il conteggio dei rientri e il residuo determinano lo stato mostrato
anche per noleggi ancora active nel database. Il filtro e il popup usano gli stessi stati.
Nello storico il pagamento si registra dalla riga o dal popup dei noleggi conclusi
con saldo pendente. Riutilizza il modulo e l'endpoint dei rientri (query 014):
aggiorna subito importi e stato nell'elenco e riapre il dettaglio aggiornato.
Saldo parziale mantiene il giallo, saldo completo passa al verde. Modifica e
annullamento restano da implementare. I rientri si registrano nella pagina dedicata.
Non richiede nuove query SQL rispetto alle tabelle già predisposte.
Magazzino noleggio (`/materiale-noleggio`) legge il materiale reale della sede attiva.
Magazzino vendita (`/materiale-vendita`) mantiene categorie, colonne e struttura,
ma il dataset locale in `src/pages/inventory/sale-inventory.ts` è vuoto: i dati di prova
sono stati rimossi e il collegamento ai dati vendita resta da implementare.
Le categorie vendita sono Sci, Snowboard, Scarponi, Bastoncini, Casco, Maschere,
Kit ARTVA e Ciaspole. Le colonne dipendono dalla categoria e il dettaglio, quando
saranno presenti articoli, mostra caratteristiche e codici degli esemplari.
Entrambi i magazzini si aprono sulla categoria Sci, senza la vista Tutto il materiale.
Vendite (`/vendite`) mantiene ricerca cliente e filtri per materiale, ma l'elenco
è vuoto: i dati di prova sono stati rimossi. Il riepilogo PDF è disabilitato senza
vendite. Il collegamento allo storico reale resta da implementare.
La sidebar separa Panoramica, Anagrafica, Storico, Operatività e Magazzino. Lo storico non
crea prenotazioni; permette dettagli e registrazione del saldo dei noleggi già rientrati.
Operatività contiene `/operativita/noleggi` e `/operativita/vendite`. Nei noleggi è
attivo il primo passaggio cliente, descritto sotto; la vendita mantiene l'anteprima
del flusso. La conferma del noleggio è attiva dopo la query 012; i rientri richiedono la query 013; vendite e invio email restano da implementare.
Rientri (`/operativita/rientri`) legge i noleggi reali della sede con fine prevista
oggi (Europe/Rome), tramite `GET /locations/{id}/rental-returns`.
Include prenotazioni confermate, in preparazione, attive e concluse con materiale,
escludendo giorni diversi e annullati. Tre sezioni distinguono materiale ancora da
restituire (rosso), tutto rientrato con saldo pendente (giallo) e tutto completato
(verde). I rientri completi restano visibili nella rispettiva sezione del giorno.
Mostra contatori del giorno, ricerca cliente/contatti/numero/codice materiale,
paginazione e scheda consultabile con codici, stato dei singoli articoli e note.
Caricamento, errore con retry, giorno senza rientri e ricerca vuota sono distinti.
«Aggiorna» rilegge i dati; cambio sede e cambio giorno italiano azzerano la vista,
annullando le richieste precedenti. Il giorno è ricontrollato ogni minuto e al focus.
«Registra rientro» apre un form persistente e invia `POST /locations/{id}/rental-returns`
per ogni codice. Dopo ogni successo svuota e rifocalizza il campo per il codice
successivo, mostrando sotto la prenotazione aggiornata: rosso se mancano articoli, giallo se tutto è
rientrato ma resta un saldo, verde se tutto è rientrato e saldato. Totale, pagato
e residuo sono visibili nella scheda. Il rientro non registra incassi.
La registrazione funziona anche per riconsegne anticipate o in ritardo di noleggi
già iniziati. Richiede `013_register_rental_return.sql` in Supabase.
L'ID resta stabile sui ritentativi e cambia dopo ogni successo o modifica del codice.
La ricerca si applica a tutte e tre le sezioni, ciascuna con paginazione indipendente.
In «Da saldare», il pulsante «Registra pagamento» è disponibile sia nella riga
sia nella scheda. Il modulo propone il residuo e permette importo parziale o totale,
metodo, data/ora italiana e note. Al salvataggio aggiorna scheda ed elenco:
resta giallo con residuo positivo, passa verde/completed quando è tutto saldato.
Il pagamento è solo una registrazione di un incasso già ricevuto.
Richiede `014_register_rental_payment.sql` dopo 013; gli invii ripetuti dallo stesso
modulo non duplicano il pagamento. Il server ricalcola il saldo e rifiuta importi
superiori al residuo aggiornato o materiale non ancora completamente rientrato.
I requisiti raccolti sono conservati in [`../docs/requisiti.md`](../docs/requisiti.md).

Clienti (`/clienti`, in Anagrafica) usa i dati reali restituiti da FastAPI:
nome, cognome, email, telefono, data di nascita, livello, lingua, paese e note.
I nuovi campi richiedono la query 015 e sono facoltativi. La ricerca filtra nome, cognome, email e
telefono, ignora maiuscole e accenti e riconosce i telefoni anche senza spazi
o trattini. Consente di combinare nome e cognome in qualsiasi ordine.
I clienti sono condivisi tra le sedi. Non sono usati clienti dimostrativi:
caricamento, errore con retry, elenco vuoto e ricerca senza risultati sono distinti.
Cliccando la riga o il nome del cliente si apre la scheda delle prenotazioni:
numero complessivo e lista dalla più recente alla più vecchia, con inizio, fine,
sede, totale e pagato. Comprende tutte le sedi autorizzate, con pagine di 20 righe.
Il conteggio riguarda i noleggi salvati nel gestionale; il CSV anagrafico non
contiene le singole prenotazioni storiche. Le azioni modifica/elimina non aprono
questa scheda. Caricamento, errore con retry e assenza di prenotazioni sono distinti.
La chiusura o il cambio sessione annullano le richieste e ignorano risposte tardive.
Non servono nuove query SQL.
La colonna Azioni mostra due piccoli pulsanti, modifica ed elimina. Il modulo di
modifica compila i dati esistenti e invia soltanto i campi cambiati: eventuali
recapiti legacy non validi e non modificati rimangono intatti. La cancellazione
richiede conferma e nasconde il cliente, conservando i riferimenti nello storico.
Entrambe le azioni richiedono la query 017; errori non chiudono il modulo né
rimuovono righe. L'elenco usa pagine di 50 clienti e la ricerca considera tutti i
clienti caricati, anche quelli fuori dalla pagina corrente. La colonna azioni
rimane visibile durante lo scorrimento orizzontale.

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
l'opzione Nessun albergo. Il nuovo noleggio è una scheda unica, senza pannelli richiudibili:
sugli schermi ampi cognome, nome, cellulare ed email sono affiancati, con date
e albergo accanto. Le note cliente e prenotazione occupano una riga dedicata.
Materiale, riepilogo e pagamento seguono sotto. Sui portatili cliente e soggiorno
occupano due righe orizzontali; sui telefoni i campi si impilano.
Campi, pulsanti e tabelle usano caratteri più grandi. Il rientro non può precedere l'inizio; le due date possono coincidere.
Date e albergo appartengono alla bozza del noleggio e non modificano il cliente;
restano compilati anche quando si cambia persona nello stesso flusso. Gli alberghi
usano gli ID reali di Supabase e lo sconto corrente nel riepilogo. Fino alla conferma,
bozza e selezione si azzerano dopo ricaricamento o cambio sede.
Il modulo mantiene i valori su errore, blocca invii simultanei e annulla le richieste
al cambio sessione o uscita dalla pagina; una richiesta già arrivata al server può
essere stata salvata, quindi in caso di errore di connessione verificare l'anagrafica.

L’area «Materiale» è sempre visibile sotto cliente e soggiorno. Legge il magazzino
reale della sede attiva con `GET /locations/{id}/rental-inventory?available_only=true`, già autorizzato
dal backend. Il campo codice accetta testo e invio da un lettore che emula la tastiera;
il confronto è esatto, conservando maiuscole, simboli e zeri iniziali. «Aggiungi codice»
consente anche l'inserimento manuale. Dopo l'aggiunta il campo viene svuotato e resta
pronto per il codice successivo.

La ricerca manuale filtra categoria, codice, marca, modello, misura e gruppo, con
pagine di 20 esemplari. Ogni esemplare può essere aggiunto una sola volta. Sono
selezionabili soltanto articoli attivi, noleggiabili e prenotabili; manutenzione,
dismissione e altre disabilitazioni sono mostrate senza indicare una disponibilità
per data nella loro etichetta. Gli articoli scelti mostrano codice, categoria, marca, modello e misura,
con un comando di rimozione.

L'elenco esclude gli esemplari consegnati/non rientrati e le prenotazioni
confermate o in preparazione sovrapposte alle date scelte (estremi inclusi).
Senza periodo completo viene verificata la disponibilità di oggi in Europe/Rome.
Le date complete passano come `starts_on` e `ends_on`; cambiarle ricarica l'elenco
e rimuove dalla selezione gli esemplari non più disponibili, con un avviso.
La disponibilità si aggiorna al cambio delle date. Il codice manuale può
aggiungere solo esemplari restituiti dalla stessa ricerca di disponibilità.
Il magazzino generale noleggi continua a mostrare tutti gli esemplari.
La selezione resta nella bozza modificando cliente;
si azzera al cambio sede/sessione, uscita o ricaricamento. La sola selezione non
crea prenotazioni né modifica gli esemplari. La conferma controlla la disponibilità
e salva il noleggio; le tariffe vengono calcolate nel riepilogo.

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
Lo sconto viene salvato nella convenzione e applicato al riepilogo del nuovo
noleggio e copiato alla conferma nella prenotazione.

La card Tariffe in Gestione apre `/management/tariffe`: il listino è diviso per
tipo di materiale, con i relativi gruppi su righe e sette colonne €/giorno (1, 2,
3, 4, 5, 6, 7+ giorni). Richiede `010_rental_rates.sql`. Le righe sono già presenti
per ogni gruppo; un gruppo nuovo riceve automaticamente una riga da configurare.
Un campo vuoto viene salvato come null, distinto da zero. Ogni gruppo viene salvato
con il proprio pulsante; i valori ancora non salvati restano compilati passando
da un tipo all'altro, ma non dopo ricaricamento o uscita dalla pagina. Tutte le
sedi usano lo stesso listino. Il riepilogo del nuovo noleggio legge queste tariffe.

Il riepilogo è sempre visibile sotto il materiale. Dopo aver scelto
cliente, periodo valido e materiale, chiede al backend i prezzi e mostra cliente,
date, durata, albergo, tariffa giornaliera e totale per esemplare, subtotale,
sconto dell'albergo e totale finale. I giorni sono inclusivi; da 7 giorni in poi
si usa la fascia 7+ per tutti i giorni. Una tariffa mancante resta distinta da
zero e impedisce di mostrare un totale completo. Le righe già note restano visibili.
Date, albergo e materiale modificati invalidano il riepilogo precedente; richieste
superate vengono annullate. «Aggiorna prezzi» rilegge listino e sconto correnti.
L'endpoint è di sola
lettura: non salva prenotazioni, non registra pagamenti e non riserva gli articoli.

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
├── pages/returns/         # Rientri di oggi e registrazione per codice
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


L’area «Pagamento», dopo il riepilogo, permette di scegliere Paga dopo, Acconto o Saldo
completo. Le opzioni si attivano solo con un riepilogo valido. Acconto e saldo
richiedono metodo (Contanti, Carta, Bonifico o Altro), data/ora italiana modificabile
e note facoltative. L'acconto deve essere positivo e inferiore al totale. Il saldo
segue automaticamente il totale ricalcolato; un acconto diventato eccessivo viene
segnalato senza alterare l'importo digitato. I calcoli usano centesimi interi.
Un totale zero non prepara alcuna riga pagamento. La scelta rimane bozza fino alla conferma.

«Conferma noleggio» richiede cliente, periodo, materiale, prezzi e pagamento validi.
Invia una sola richiesta a `POST /locations/{id}/rental-bookings`, con un ID stabile
per tutta la bozza. Durante il salvataggio i campi sono disabilitati e gli invii
ripetuti sono bloccati. Al successo mostra il numero del noleggio, totale, importo
registrato e residuo ricevuti dal backend. «Nuovo noleggio» apre una nuova bozza.
In caso di errore conserva i dati: riprovare dallo stesso modulo riusa l'ID e non
duplica una conferma già riuscita. La funzione richiede `012_confirm_rental_booking.sql`.
Non vengono collegati cassa o vendite. I rientri usano il flusso separato con query 013.

In Periodo e albergo è presente «Note prenotazione», facoltativo (massimo 5.000
caratteri), separato dalle note anagrafiche e di pagamento. Compare nel riepilogo
e nella schermata di conferma ed è salvato in `rental_bookings.notes`.
Non influisce sui prezzi e resta compilato durante la compilazione della scheda. Se 012 è già
stata applicata, rieseguire la versione aggiornata per aggiornare la funzione.


I campi anagrafici aggiuntivi (query 015) sono mostrati nella tabella Clienti e
nel dettaglio noleggio. Quando si registra un cliente dal nuovo noleggio, una riga
aggiuntiva permette nascita, livello e codici lingua/paese facoltativi. Un cliente
esistente con questi dati li mostra già compilati in sola lettura; non vengono
sovrascritti selezionandolo per una prenotazione. L'importazione dei vecchi clienti
non è ancora stata effettuata.


Operatività contiene anche Riparazioni (`/operativita/riparazioni`), con elenco reale
per sede degli interventi aperti e ricerca per codice, marca/modello, misura e tipo.
Un form permette di segnare sci/snowboard in riparazione tramite codice, intervento
e note. Richiede le query 018 e 019. L'elenco non contiene dati dimostrativi.
Nel nuovo noleggio, ricerca manuale e inserimento codice riconoscono open_repair
e aprono la conferma «L'oggetto era in riparazione, sicuro di volerlo noleggiare?».
Annulla non modifica né riparazione né selezione; il consenso completa l'intervento
nel database e soltanto dopo aggiunge l'articolo aggiornato alla bozza. La chiusura
è immediata, non dipende dalla conferma successiva della prenotazione e non viene
annullata rimuovendo l'articolo dalla bozza. Gli errori non aggiungono materiale.
Cambio sede/sessione e uscita dalla pagina annullano le richieste pendenti; gli
articoli occupati e le manutenzioni prive di intervento aperto restano non selezionabili.

Magazzino contiene anche **Magazzino generale noleggi** (`/magazzino-generale`): vista
del materiale da noleggio di tutte le sedi autorizzate, indipendente
dalla sede selezionata nella sidebar. Raggruppa per categoria e caratteristiche
fisiche (marca, modello, anno, misure, taglia ecc.), anche quando
il catalogo contiene varianti equivalenti in gruppi tariffari diversi. La ricerca
comprende codici, sede e gruppo; cercare un codice conserva tutti gli esemplari
del gruppo. Aprendo una riga, il dialogo mostra gli esemplari separati per sede,
con codice univoco, stato di magazzino/intervento aperto, gruppo, matricola e note.
La quantità è il totale censito, non la disponibilità per un periodo di noleggio.
La creazione resta nel magazzino noleggio della singola sede; il trasferimento è
disponibile anche nella scheda individuale aperta dal magazzino generale.

La voce **Magazzino generale vendite** (`/magazzino-generale-vendite`) usa la stessa
pagina dei noleggi con ricerca, filtro categoria, ordinamento e dettaglio per sede,
aggiungendo il prezzo unitario anche tra gli ordinamenti. Legge `/sale-inventory`:
nessun dato dimostrativo, né copia del materiale da noleggio. Le quantità sono
sommate dalle giacenze reali; prezzi diversi producono un intervallo nella tabella,
con i singoli prezzi nel dettaglio della sede. Null viene mostrato come «Da definire»
e resta distinto da zero. Le giacenze esaurite sono escluse dall'API.
Il modello vendita attuale è per variante/sede/quantità, senza codici dei singoli
pezzi: il dettaglio mostra quantità, prezzo e note senza inventare esemplari.


La scheda del materiale nel magazzino noleggio locale include la sezione
**Tariffa**, chiusa inizialmente ed espandibile. Alla prima apertura legge il
listino condiviso `/rental-rates` per il gruppo dell'articolo e mostra tutte le
sette fasce in €/giorno, prima degli sconti. I valori null o il gruppo privo di
listino sono «Non impostata», zero resta 0 €. Errori e ritentativi sono separati
dalla lettura del magazzino; alla chiusura della scheda le richieste sono annullate.


In «Esemplari e codici univoci» il pulsante **Vedi** apre la scheda del singolo
codice: caratteristiche, stato, matricola, note e prezzi dell'esemplare, numero
di noleggi, riparazioni concluse e noleggi dall'ultima riparazione. Il popup di
modello resta aperto sotto la scheda; Esc/Torna al materiale chiude solo questa.
Lo spostamento di sede è disponibile nella scheda individuale, dopo il caricamento.
I conteggi vengono letti all'apertura, con retry e annullamento delle richieste
quando si chiude o cambia sede. Non sono calcolati per modello o quantità.


Nel popup del modello del generale noleggi, gli esemplari sono separati per sede
con titoli violetto. «Vedi» apre la stessa scheda individuale del magazzino locale:
caratteristiche, sede, note/matricola e conteggi di noleggi e riparazioni. Note e
matricola non sono più colonne nella tabella degli esemplari del modello.
I pulsanti «Sposta articolo in sede [nome]» trasferiscono direttamente il codice
verso una delle altre sedi autorizzate, usando la sede dell'esemplare come origine
(anche quando diversa da quella selezionata nella sidebar). Usano la RPC esistente:
blocco doppio invio, errori senza modifiche anticipate, chiusura bloccata durante
l'invio. Al successo la scheda individuale si chiude, il modello resta aperto e si
aggiornano sia gli elenchi degli esemplari sia le quantità nelle card per sede.

Sotto il riepilogo globale, ogni sede ha tre card: totale esemplari, attualmente
noleggiati e attualmente in riparazione. I noleggiati usano il flag reale restituito
dal backend, le riparazioni contano maintenance o interventi aperti senza duplicati.
Le sedi vuote mostrano zero e i filtri della tabella non modificano le card.


La sidebar è ordinata in Panoramica (Dashboard/Analytics), Anagrafica, Noleggi,
Vendite, Operatività (Rientri/Riparazioni), magazzino della sede, magazzino generale
e Amministrazione. Le operazioni nuove e gli storici sono sotto Noleggi/Vendite.
`/noleggi/attuali` mostra prenotati, in preparazione e da riconsegnare;
`/noleggi` mostra conclusi, conclusi da saldare e annullati. Le viste riusano i
filtri e i dettagli reali della sede e distinguono lo stato effettivo, inclusi i
noleggi con tutto restituito ma ancora da saldare. Rientri è disponibile in Operatività. La voce Storico noleggi ha corrispondenza
esatta nel menu, per non risultare attiva insieme a Noleggi attuali.

Gestione include **Promozioni**, collegata a `/management/promozioni`. Il form
richiede nome e percentuale, permette una data singola oppure la selezione di
uno o più giorni della settimana. L'elenco mostra nome, validità, percentuale,
creazione e Rimuovi. Le scritture impediscono invii doppi, conservano i campi in
caso di errore e vengono annullate all'uscita. I dati sono reali, senza esempi;
serve eseguire `backend/sql/020_promotions.sql`. Le promozioni sono configurazioni
condivise; la loro applicazione ai noleggi richiede anche la query 021.


Nel riepilogo del nuovo noleggio viene applicato automaticamente il maggiore
sconto tra albergo e promozioni valide, senza cumulo. Le promozioni valgono solo
per una giornata; per più giorni rimane lo sconto albergo. Il riepilogo identifica
la promozione scelta, lo storico mostra il nome salvato alla conferma. Richiede
`backend/sql/021_apply_rental_promotions.sql` per allineare il salvataggio.

Per un cliente esistente, nel nuovo noleggio cellulare ed email sono modificabili;
nome/cognome rimangono in sola lettura. «Salva recapiti» aggiorna solo i contatti
cambiati tramite PATCH /customers/{id}, senza creare duplicati né inviare gli altri
attributi. La conferma del noleggio salva automaticamente eventuali modifiche ai
contatti prima della prenotazione e si ferma se il salvataggio fallisce. I dati
storici non validi ma non modificati non vengono inviati. Titoli violetto, separatori
violetto da 1px e bordi violetto da 1px sono limitati alla scheda del nuovo noleggio.


Promozioni offre anche «Periodo», con Dal/Al obbligatori e fine non precedente
all'inizio; nell'elenco compare l'intervallo completo. Il form invia solo il tipo
di validità scelto, escludendo valori nascosti degli altri tipi. Serve la query
022_promotions_period.sql; le promozioni restano riservate ai noleggi di un giorno.

Noleggi stagionali richiede `backend/sql/023_seasonal_rentals.sql` e aggiunge:

- Gestione → **Tariffe stagionali** (`/management/tariffe-stagionali`): nome
  stagione, unica data di consegna e prezzi totali singolo/pack per gruppo,
  divisi per categoria. «Nuova stagione» conserva le precedenti nell'elenco.
- Noleggi → **Nuovo noleggio stagionale** (`/operativita/noleggi-stagionali`):
  cliente, inizio, consegna globale in sola lettura, materiale, riepilogo e
  pagamento registrato. I pack sono riconosciuti automaticamente quando ci sono
  sci/snowboard e scarponi compatibili; i bastoncini sono facoltativi e inclusi
  nel pack sci. Nessuna scelta manuale formula; serve anche la query 024.
- Noleggi → **Noleggi stagionali** (`/noleggi/stagionali`): selezione stagione,
  filtri per stato e dettagli con importi, componenti inclusi e pagamenti.

La consegna è la restituzione comune ai nuovi stagionali; le prenotazioni già
confermate conservano la propria data. Il pack occupa tutti i codici inclusi e
riusa il flusso di rientro. Le configurazioni iniziali sono vuote, senza prezzi
dimostrativi. Importi singoli o pack mancanti impediscono la conferma.

Con `backend/sql/025_generic_poles.sql` il codice **1** aggiunge i bastoncini sia
nei noleggi giornalieri sia negli stagionali. Sono gratuiti con gli sci anche
senza scarponi e compaiono vicino al relativo pack; da soli usano il prezzo del
gruppo **Bastoncini generici** nel listino pertinente. Lo stesso codice rimane
disponibile per altri noleggi e altre sedi. Per il rientro, aprire la scheda della
prenotazione e «Registra un altro rientro», poi inserire 1; dopo il rientro di un
codice fisico il modulo usa come contesto la prenotazione appena individuata e
ne mostra il numero per i bastoncini.

Eseguire anche `backend/sql/026_generic_pole_quantities.sql` per inserire più
volte 1 nella stessa prenotazione. Ogni inserimento aggiunge una riga distinta
sia nella selezione sia nel riepilogo; Rimuovi elimina un paio. Il numero totale
degli articoli include tutte le righe. Un paio per ogni paio di sci è incluso
nel relativo pack; quelli in eccedenza seguono il listino. Rientri e storico
conservano le singole righe e i rientri separati.

Tariffe mostra per ogni gruppo sci/snowboard due righe, Singolo e Pack, con le
stesse sette durate e un solo Salva per gruppo. Le righe dello stesso gruppo sono
affiancate verticalmente; i gruppi sono separati da una linea viola sottile. Le
altre categorie mantengono solo il prezzo singolo. Richiede
`backend/sql/027_daily_pack_rates.sql`; i prezzi esistenti sono conservati e i
nuovi prezzi pack sono inizialmente vuoti. I pack giornalieri sono calcolati automaticamente; per confermarli serve anche
`backend/sql/028_apply_daily_packs.sql`.

Nel nuovo noleggio, sci/snowboard con scarponi compatibili diventano un pack
automaticamente: il riepilogo mostra Pack 1/2 e gli articoli inclusi vicini, con
prezzo pack giornaliero sull'attrezzo e zero sugli scarponi. Anche lo storico
conserva questi abbinamenti. Un prezzo pack mancante mantiene il totale non
confermabile fino alla configurazione e al ricalcolo del listino.

Le quattro pagine dei noleggi attuali/storici, giornalieri/stagionali, mostrano
il cestino rosso a destra con lo stesso stile dei Clienti. Il dialogo richiede
conferma e segnala che le assegnazioni saranno liberate. Dopo il successo la riga
sparisce e i conteggi si aggiornano; in caso di errore la prenotazione resta
visibile. Le richieste duplicate sono bloccate e quelle pendenti annullate
all'uscita. Richiede `backend/sql/029_delete_rental_bookings.sql`.

La sidebar è ora condensata in Panoramica, Noleggi, Operatività, Vendite,
Anagrafica, Magazzino e Amministrazione. Nuovo noleggio offre Giornaliero
(predefinito) e Stagionale nella stessa pagina. Noleggi attuali e Storico noleggi
partono da Tutti e permettono di scegliere Giornalieri o Stagionali; per questi
ultimi rimane disponibile il selettore della stagione. Gli elenchi conservano
formule pack, pagamenti, dettagli e cancellazione.

Magazzino contiene Magazzino sede (con il nome della sede selezionata) e
Magazzino generale; ogni pagina permette di scegliere Noleggio o Vendita. Gli
indirizzi precedenti dei magazzini e degli stagionali reindirizzano alle nuove
pagine con il tipo corretto. Le selezioni del tipo sono conservate nell'URL.
Questa riorganizzazione non richiede modifiche al database.

Lo storico importato con 030 appare in **Storico noleggi → Tutti** e nelle schede
dei clienti associati. Conserva tutte le prenotazioni dello stesso cliente, con
codice originale e dicitura «Storico importato». La politica concordata le
presenta come concluse e interamente saldate: totale=pagato CSV e residuo zero.
Il dettaglio conserva le riconsegne note e gli importi originali, senza inventare
metodi, date di pagamento o pack. Le anagrafiche ambigue sono segnalate, senza
perdere le prenotazioni. Ricerca, filtri, ordine cronologico e cestino rimangono
disponibili; il materiale vecchio non modifica le disponibilità attuali.
