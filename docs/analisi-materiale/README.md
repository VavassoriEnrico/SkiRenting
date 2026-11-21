# Analisi dei 23 elenchi di materiale

Analisi del 11 novembre 2026. Proposta da discutere prima di creare le nuove tabelle.
Non sono state apportate modifiche a Supabase, al backend o alle pagine del magazzino.
Le tabelle esistenti dichiarate dall'utente sono `operator_profiles`, `locations`
e `operator_locations`: rimangono invariate.

Lo script locale pronto per la creazione iniziale è
[`002_material_catalog_and_inventory.sql`](../../backend/sql/002_material_catalog_and_inventory.sql).
Campi esatti e istruzioni di popolamento sono in
[`backend/sql/README.md`](../../backend/sql/README.md). Lo schema è stato verificato
su PostgreSQL temporaneo ma non è stato applicato al progetto Supabase.

L'estrazione completa per celle è ora pronta: **1.305 codici distinti e 547 varianti**.
Lo SQL di popolamento e le verifiche sono descritti in
[`import/README.md`](import/README.md). I totali sotto riportati sono stati riconciliati
con le righe effettivamente ricostruite.

## Decisioni confermate dal cliente

- Tutti i 23 elenchi appartengono al magazzino generale. Gli esemplari saranno
  inizialmente assegnati alla sede **Madesimo**, usando il relativo ID in `locations`.
- Il responsabile potrà successivamente correggere l'assegnazione e trasferire
  il materiale nelle altre sedi.
- I gruppi originali identificano gruppi con tariffe di noleggio diverse.
- Le tariffe verranno definite in seguito: per ora si conservano i gruppi e
  l'associazione degli esemplari, senza inventare prezzi o impostare valori a zero.

## Cosa contengono i documenti

Sono 23 PDF, per un totale di 50 pagine. I totali riportati nei documenti sommano
1.305 righe di inventario; questo numero non certifica ancora 1.305 codici distinti.
Il conteggio della dicitura «Noleggiabile e prenotabile» coincide con il totale
riportato in ciascuno dei 23 documenti.

Sono report di articoli del vecchio gestionale, con una riga per esemplare.
Tutti riportano «Noleggio proprietario: Powder Ski Rent» e lo stesso stato.
Questo identifica l'inventario esportato ma non prova l'assegnazione a una delle
due sedi create in SkiRenting. Il cliente ha successivamente indicato Madesimo
come sede iniziale per tutti questi articoli. Non sono un inventario vendita né uno storico vendite.

Le intestazioni comuni sono:

- Codice.
- Tipo, per esempio Sci o Scarpa snowboard.
- Categoria, per esempio ALLMOUNTAIN o SCARPONI SNOW ADULTO.
- Marca e modello.
- Anno.
- S/N.
- Una colonna di misura: lunghezza, numero o taglia a seconda del materiale.
- Stato.
- PRZ ACQ e PRZ VENDUTO.

L'estrazione del testo da PDF mescola a volte le colonne. Un controllo visivo delle
prime pagine di Allmountain, scarponi sci adulto, caschi, scarponi baby e 4 ganci baby
conferma che S/N e misura sono colonne diverse: in queste pagine la prima è vuota,
mentre la seconda contiene valori come 170 cm, 24.5, M o Taglia unica.
Non caricare quelle misure come numeri di serie.

## Raggruppamento delle fonti

| Famiglia fisica | File / gruppi del vecchio gestionale | Totale dichiarato |
| --- | --- | ---: |
| Sci | ALLMOUNTAIN, RACE, FREERIDE, FREERIDE BABY, FREESTYLE BABY, SCI BABY | 241 |
| Snowboard | SNOW ADULTO, SNOWBOARD BABY, SNOW FRESCA, SPLITBOARD, SUPERMATIC | 215 |
| Scarponi sci | SCARPONI SCI ADULTO, SCARPNI ADULTO PLUS, SCARPONI SCI BABY, 4 GANCI BABY, SCARPONI SCI DALBELLO, SCARPONI ALPINISMO | 389 |
| Scarponi snowboard | SCARPONI SNOW ADULTO, SCARPONI SNOW BABY | 200 |
| Caschi | CASCHI | 197 |
| Ciaspole | CIASPOLE | 51 |
| ARVA / ARTVA | ARVA | 9 |
| Bob / slittini | BOB | 3 |
| **Totale** | **23 file** | **1.305** |

Il dettaglio per file è in [`inventario-fonti.csv`](inventario-fonti.csv).
Queste sono famiglie osservate nelle fonti, non nuove tabelle già create.
Bastoncini e maschere erano nei requisiti ma non hanno un PDF dedicato in questa
consegna: non significa che non esistano nel negozio.

## Struttura proposta

Non creare una tabella per ogni PDF. «Sci» descrive una famiglia fisica;
«ALLMOUNTAIN» o «RACE» sono gruppi del vecchio gestionale; marca, modello e misura
descrivono una variante; il codice identifica l'esemplare posseduto dal noleggio.
Il catalogo resta condiviso tra le sedi, mentre ogni esemplare ha la propria sede.

| Tabella proposta | Una riga rappresenta | Dati principali |
| --- | --- | --- |
| `material_categories` | Famiglia di materiale | ID, nome, eventuale codice interno stabile |
| `material_groups` | Raggruppamento operativo del vecchio gestionale | ID, categoria, nome originale, attivo |
| `material_variants` | Modello e variante fisica | ID, categoria, marca, modello; caratteristiche collegate alle tabelle di dettaglio |
| Tabelle di dettaglio | Caratteristiche della variante | Misure e attributi specifici del materiale |
| `rental_inventory` | Singolo esemplare o paio/kit noleggiabile come unità | ID, variante, codice testuale, sede, gruppo, stato, anno originale, eventuale costo di acquisto |
| `sale_inventory` | Quantità di una variante in vendita in una sede | ID, variante, sede, quantità, prezzo di vendita |

`sale_inventory` è prevista dai requisiti precedenti; questi PDF non ne forniscono
le giacenze. Non copiare automaticamente gli stessi esemplari nei due magazzini.
La gestione dei codici individuali per la vendita è ancora da decidere.

### Categorie e gruppi

Le famiglie fisiche non devono confondersi con classificazioni commerciali.
Si può mantenere la voce «Scarponi» nell'interfaccia e distinguere nel catalogo
scarponi sci e snowboard con una sottocategoria o disciplina. La scelta dei nomi
va concordata prima del DDL; l'importazione deve conservare entrambe le distinzioni.

I gruppi devono conservare inizialmente le etichette del gestionale originale:
ALLMOUNTAIN, RACE, SCARPONI ADULTI +, SUPERMATIC ecc. Il gruppo è assegnato
all'esemplare in `rental_inventory`, perché può rappresentare una classificazione
operativa o tariffaria, non necessariamente una proprietà tecnica del modello.
La categoria del gruppo deve essere coerente con quella della variante associata.
Il cliente ha confermato il significato tariffario dei gruppi. Gli importi verranno
definiti in seguito: non attribuire automaticamente tariffe durante l'importazione.

«Baby» è presente in più famiglie: non è una famiglia fisica a sé.
«SCARPONI DALBELLO» è un gruppo presente nei dati, anche se Dalbello è una marca:
non eliminarlo né trasformarlo automaticamente in una nuova famiglia.
«SUPERMATIC» compare sotto Snowboard; non riclassificarlo come attacchi sulla base
del solo nome. Il contenuto fisico del noleggio va confermato.

### Varianti e caratteristiche

Per semplicità, nella prima versione si può mantenere marca e modello direttamente
in `material_variants`, ripetuti tra varianti con misure diverse. Non serve aggiungere
subito un ulteriore livello di tabelle per le marche e i modelli.

Esempi di tabelle di dettaglio, con `variant_id` come chiave primaria e riferimento
a `material_variants`: una sola scheda di dettaglio per variante.

| Dettaglio | Caratteristiche osservate nei PDF | Campi dei requisiti precedenti, non dimostrati dagli elenchi |
| --- | --- | --- |
| `ski_details` | Lunghezza in cm | Raggio; tipo tecnico, se distinto dal gruppo operativo |
| `snowboard_details` | Lunghezza in cm | Raggio; tipo tecnico, se distinto dal gruppo operativo |
| `boot_details` | Misura originale come 24.5 o 27 | Taglia EU e lunghezza suola in mm; interpretazione Mondopoint da confermare |
| `helmet_details` | Taglia, per esempio XXS, S o L | Colore |
| `snowshoe_details` | Taglia unica negli esempi esaminati | Intervalli di taglia ulteriori |

Per ARVA e bob gli elenchi mostrano principalmente marca, modello, anno e taglia
unica: non creare tabelle di dettaglio vuote solo per simmetria. La taglia testuale
può essere un dato comune di variante quando non c'è una misura tecnica specifica.
Per ciascun dettaglio, il futuro inserimento deve verificare che il tipo sia corretto:
non deve essere possibile associare `ski_details` a una variante di casco.

I campi non presenti non si inventano e non si rendono obbligatori all'importazione.
Il valore originale della misura va sempre conservato nell'area di importazione,
prima di convertirlo. Non dedurre EU, centimetri e millimetri con conversioni automatiche.

L'intestazione «ANNO» non specifica se sia anno modello, produzione o acquisto.
Nello script proposto il valore originale è conservato in `material_variants.year`
come discriminante neutro della variante, senza interpretarlo come anno di acquisto;
i dati originali dell'esemplare possono essere conservati anche in `source_data`.
Una volta chiarito, evitare di accorpare annate diverse solo perché marca,
modello e lunghezza coincidono.

### Esempio reale

In `ALLMOUNTAIN.pdf` gli esemplari `PO445`, `PO539` e `PO540` sono tutti:
BLIZZARD, ANOMALY 84 R, anno 2025, lunghezza 164 cm.

Nel catalogo basta una variante corrispondente; nel magazzino noleggio ci sono
tre righe, ognuna con il proprio codice. Nella tabella riassuntiva del frontend
la quantità è 3, ricavata dal conteggio degli esemplari.
Il record da 170 cm è una variante distinta.

La quantità non va salvata anche sulla variante, altrimenti può divergere dagli
esemplari effettivamente presenti nelle diverse sedi.

## Stato, disponibilità e prezzi

«Noleggiabile e prenotabile» indica l'idoneità del materiale, non dimostra che
l'esemplare sia libero oggi o in un certo intervallo. Le prenotazioni e le consegne
serviranno per calcolare quella disponibilità. Questi PDF non le contengono.

La sede dell'esemplare e lo stato operativo sono dati di magazzino, non del catalogo.
Un esemplare venduto o dismesso dovrà restare referenziabile dallo storico.

PRZ ACQ e PRZ VENDUTO non sono una tariffa giornaliera né una quantità venduta.
Molte celle sono vuote. Alcuni documenti mostrano anche «Totale prezzo listino»,
tra cui scarponi alpinismo con 0,18 €: è un valore da verificare, non una base per
dedurre prezzi o tariffe dei singoli articoli.
Un prezzo sconosciuto resta nullo, non viene trasformato automaticamente in zero.

## Qualità dei dati e importazione

- Codici come `0156`, `0029668`, `PO441`, `+C12000081353`, `DREAM` e `ORCA`
  dimostrano che il codice deve essere `text`, non numerico.
- Nei dati esistono codici numerici molto lunghi, anche di 18 cifre. Devono
  restare stringhe anche in JSON, Excel e nel frontend.
- Conservare maiuscole, zeri iniziali e simboli fino alla verifica del lettore.
  Non rimuovere automaticamente `+`, parentesi o altri prefissi.
- In `SCARPONI SCI BABY.pdf`, prima pagina, compare un articolo con codice `/`.
  Va verificato: non si può assumere che identifichi in modo affidabile un esemplare.
- Verificare duplicati sia all'interno dei file sia tra i file e le sedi, prima
  di imporre un vincolo di unicità globale sui codici.
- Conservare marca/modello originali; correggere eventuali refusi solo dopo verifica.
  Le aggregazioni non devono fondere modelli diversi per similarità del nome.
- Nei PDF il testo estratto non conserva sempre l'ordine delle celle. Per un'importazione
  automatica definitiva è preferibile l'export CSV/Excel del vecchio gestionale.
  Se si usano questi PDF, serviranno ricostruzione per coordinate, controllo visivo
  e riconciliazione dei totali; l'estrazione testuale attuale non è un import pronto.

Un'area di importazione separata conserverà file, pagina, valori originali ed esito
dei controlli. Soltanto i record validati verranno trasferiti al catalogo e al magazzino.
Questo evita di perdere dati o di dover correggere il database operativo dopo il caricamento.
L'importazione dovrà poter essere ripetuta senza duplicare gli stessi esemplari.

## Decisioni prima delle query definitive

1. Assegnazione iniziale confermata: Madesimo. Individuare il relativo ID in `locations`
   prima dell'importazione; non creare una seconda sede con lo stesso nome.
2. I documenti riguardano il magazzino noleggio; il materiale vendita andrà fornito separatamente.
3. Gruppi tariffari confermati; definizione degli importi e delle regole di calcolo rinviata.
4. Chiarire il significato di ANNO e della misura degli scarponi.
5. Verificare codice `/`, possibili duplicati e codici del produttore condivisi tra esemplari.
6. Chiarire se ARVA indica il solo dispositivo o il kit con pala e sonda.
7. Mantenere la classificazione originale di Supermatic e Splitboard fino alla verifica
   degli accessori inclusi nell'unità noleggiata.

Le decisioni ancora aperte sulle misure e sull'anno influenzano la deduplicazione
delle varianti. Lo schema può essere preparato prima dell'importazione,
lasciando espliciti i valori ancora sconosciuti e rimandando le tariffe.

## Ordine di realizzazione

1. Confermare famiglie e gruppi originali.
2. Definire catalogo delle varianti e caratteristiche per famiglia.
3. Creare il magazzino noleggio per esemplare, con collegamento a `locations`.
4. Preparare e validare l'importazione, senza modificare automaticamente codici o misure.
5. Collegare le pagine di magazzino al backend, mantenendo riepilogo e scheda dell'esemplare.
6. Definire a parte giacenze vendita e successivamente prenotazioni, vendite e pagamenti.
