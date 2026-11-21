# Magazzino noleggio: lettura dei dati reali

La pagina `/materiale-noleggio` legge il catalogo e gli esemplari di `rental_inventory`
attraverso FastAPI. Il materiale dei 23 PDF è esclusivamente da noleggio:
nessuna lettura o modifica di `sale_inventory` viene introdotta da questo collegamento.

## Prerequisiti e avvio

Sono necessari i `.env` del login e gli script SQL 001 e 002 già applicati. Lo script
004 importa i 1.305 articoli nella sede Madesimo. Non occorrono nuove query o chiavi.

Avviare `npm run dev`, effettuare il login e aprire Magazzino noleggio. Il selettore
nella sidebar determina la sede consultata. Una sede senza esemplari mostra quantità
zero e un messaggio esplicito, senza sostituire il risultato con dati dimostrativi.

## Dati mostrati

- Categorie effettive del catalogo, inclusi scarponi sci e snowboard separati e bob.
- Filtro per gruppo originale, ricerca per marca, modello, anno, misura o codice.
- Righe raggruppate per ID variante e gruppo; misure diverse restano separate.
- Quantità totale e numero di esemplari attivi con `is_rentable = true`.
- Scheda con caratteristiche della categoria, anno originale, note e tutti i codici,
  con stato, abilitazioni, seriale e note dell'esemplare.

La ricerca per un codice individua la riga della variante, mantenendo le quantità e
l'elenco completo degli esemplari del suo gruppo. Le misure mancanti restano vuote:
la taglia originale degli scarponi non viene convertita automaticamente in EU o cm.

Le tariffe sono da definire. Il flag noleggiabile non indica disponibilità per una
specifica data: prenotazioni, preparazione e rientri richiedono ancora le relative
tabelle e funzioni. Anche lo storico noleggi resta dimostrativo.

## Endpoint e permessi

`GET /api/v1/locations/{location_id}/rental-inventory`

Richiede il token Supabase, verifica profilo e appartenenza alla sede, poi legge con
lo stesso token e le policy RLS. Il parametro sede viene filtrato sul backend.
Il catalogo è condiviso, mentre gli esemplari sono limitati alla sede richiesta.
La lettura usa pagine ordinate e continua fino alla fine, includendo anche archivi
superiori al limite di righe della Data API. Le scritture passano esclusivamente dalla
funzione dedicata descritta sotto.

File backend: router, service, repository e schema `rental_inventory.py` nelle
rispettive cartelle di `backend/app`. Frontend: `RentalInventoryPage.tsx` e
`rental-inventory.ts` in `frontend/src/pages/inventory`.

## Verifica

Test API con Supabase simulato: autenticazione, accesso revocato o non autorizzato,
lettura di tutti i 1.305 articoli con limite simulato di 300 righe, sede vuota ed errori.
Test frontend: raggruppamento, ricerca codici, scheda, filtri, retry, sede vuota e
annullamento delle richieste al cambio sede. Build TypeScript/Vite verificata.

La lettura sul progetto Supabase reale richiede la sessione dell'operatore nel browser;
i test automatici non accedono ai dati remoti.


## Nuovo articolo

Eseguire nel SQL Editor tutto [005_create_rental_item.sql](../backend/sql/005_create_rental_item.sql).
È un aggiornamento dello schema esistente, senza reimportare o cancellare materiale.
Dopo la query, aprire il pulsante **Nuovo articolo** in Magazzino noleggio.

Il modulo richiede una categoria e un gruppo per articolo, selezionabili dagli
elenchi esistenti o creabili nello stesso modulo. Per una nuova categoria si
specificano nome, codice interno e famiglia di campi. Un articolo può riutilizzare
una variante del catalogo condiviso, anche se presente soltanto in un'altra sede,
oppure definire marca, modello, anno, note e tutti i dettagli della categoria.
Il pulsante «Usa come base» consente di partire dalle caratteristiche di una variante
esistente per creare una nuova misura senza cambiare quella originale.

Per l'esemplare: codice univoco obbligatorio, S/N, stato, flag noleggiabile e
prenotabile, prezzo di acquisto, prezzo venduto storico opzionale e note.
La sede è quella selezionata nella sidebar. Le date e gli ID sono generati dal database;
file, pagine e altri campi di provenienza dei vecchi PDF non vengono inventati.
Non viene definita una tariffa giornaliera. Le quantità sono aggiornate contando
l'esemplare aggiunto; non si inserisce una quantità accanto a un singolo codice.

Endpoint aggiuntivi:

- `GET /api/v1/locations/{location_id}/rental-catalog`: categorie, gruppi attivi e
  varianti attive, con paginazione e verifica della sede.
- `POST /api/v1/locations/{location_id}/rental-inventory`: valida i dati e invoca
  `skirenting_create_rental_item` con il token dell'operatore. Risponde 201 al successo,
  409 per duplicati, 403 per sede non autorizzata e 422 per dati incoerenti.

La funzione salva categoria, gruppo, variante, caratteristiche ed esemplare in
un'unica transazione. Un errore annulla tutti gli inserimenti della richiesta.
La funzione verifica nuovamente l'utente e la sede anche se chiamata direttamente
tramite Supabase. L'esecuzione è revocata a PUBLIC e anon; search_path è vuoto e
i nomi delle tabelle sono qualificati. Riferimento: [funzioni Supabase](https://supabase.com/docs/guides/database/functions).

Il modulo impedisce invii multipli e mantiene i dati quando il salvataggio fallisce.
Dopo il successo ricarica il magazzino e seleziona la categoria aggiunta. Al cambio
sede le richieste vengono annullate e il modulo viene chiuso. Se una connessione
cade durante un salvataggio, cercare il codice prima di riprovare: il salvataggio
potrebbe essere già stato completato.

Verifiche aggiuntive: test frontend del modulo e dei campi, test API degli accessi,
della validazione e degli errori, test SQL reali su un PostgreSQL temporaneo per
transazioni, duplicati, dettagli di tutte le famiglie, riuso varianti e permessi.
Questi ultimi si possono eseguire impostando `SKIRENTING_TEST_PG_HOST` al socket
in `/private/tmp/` di un cluster di prova e `SKIRENTING_TEST_PG_PORT` alla sua porta,
poi avviando `pytest tests/integration/test_rental_creation_sql.py` dalla cartella backend.
Il test crea un proprio database casuale e lo rimuove alla fine; non usa Supabase.
