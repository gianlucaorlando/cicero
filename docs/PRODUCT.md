# Cicero — Documento di prodotto

_Versione 1.0 · 17 settembre 2026 · basato sul codice in `/Users/GOrlando/atex/ai/cicero` (prompt.ts, tools.ts, types.ts, places.ts, api.ts, use-conversation.ts, app/page.tsx, components/cicero/*)_

---

## 1. Visione in tre righe

Cicero è la voce che parla per prima quando scendi dal treno in una città che non conosci e non sai nemmeno da che parte girarti.
Non ti chiede cosa vuoi fare: ti dice dove sei, cosa è aperto adesso, e ti propone una sola mossa concreta a cui rispondere con un tocco.
Ogni luogo che nomina esiste, è verificato ed è aperto: quello che non sa, te lo dice.

---

## 2. Principi di prodotto

1. **Propone, non interroga.** Il costo cognitivo di una domanda aperta a un utente spaesato è altissimo. Cicero sceglie un default e chiede solo conferma; una domanda si fa solo quando senza quella risposta non esiste alcuna proposta sensata.
2. **Mai inventare.** Luoghi, orari, prezzi e valutazioni arrivano solo dagli strumenti. La conoscenza del modello è ammessa per usanze e consigli generali, ma va etichettata come tale e non può mai indossare il badge "verificato".
3. **Il primo minuto conta.** La sessione si gioca prima che l'utente scriva una parola: se i primi trenta secondi orientano, rassicurano e chiudono con una proposta accettabile, il resto della giornata segue. Ogni funzionalità si valuta prima di tutto su cosa aggiunge o toglie a quei trenta secondi.
4. **Una catena di sì, non una lista da leggere.** Il piano si costruisce una tappa alla volta. Quando servono più cose pratiche, diventano bottoni che rilanciano la richiesta, mai un elenco in chat (la chat non interpreta markdown, e comunque un elenco è lavoro scaricato sull'utente).
5. **Il corpo prima della cultura.** Valigia, bagno, acqua, batteria, sicurezza vengono prima di qualsiasi museo. Con il trolley in mano nessun'altra proposta ha senso.
6. **Ricorda i vincoli, non solo i gusti.** Ciò che è non negoziabile (celiachia, passeggino, il treno delle 20:10) vincola le proposte e resta visibile e correggibile; ciò che è preferenza guida senza vincolare. I dati di viaggio stanno nella sessione, le preferenze durevoli nel profilo.
7. **I limiti si dichiarano, non si mascherano.** Niente orari dei mezzi in tempo reale, niente prenotazioni, niente pagamenti. Dire "questo non lo so" costa meno fiducia di una promessa sbagliata.

---

## 3. Il primo minuto: il briefing di arrivo

### Cosa cambia rispetto a oggi

Oggi `hooks/use-conversation.ts` manda un unico `OPENING_EVENT` generico e Cicero apre proponendo una tappa qualsiasi adatta a ora e meteo. Funziona per chi è già in città con due ore libere; è sbagliato per chi è appena arrivato con una valigia in mano. Il briefing di arrivo è una **variante del turno di apertura**, non una schermata nuova: stesso meccanismo di evento nascosto, registro diverso.

### L'ordine delle informazioni (non negoziabile)

| # | Blocco | Contenuto | Fonte | Perché in questa posizione |
|---|--------|-----------|-------|----------------------------|
| 1 | **Orientamento** | Dove sei (hub riconosciuto) e dove sei rispetto al centro | Nominatim reverse + distanza calcolata in locale | È la prima domanda di ogni persona, e senza risposta tutto il resto è rumore |
| 2 | **Finestra della giornata** | Che tempo fa ora e fino a quando, luce disponibile | Open-Meteo hourly + daily | Determina se la proposta ha senso; va detto in mezza frase, non in un bollettino |
| 3 | **Essenziali vicini** | Le 3 cose da fare nei prossimi dieci minuti, come bottoni | Google Places verificato (deposito, bagni) + consiglio etichettato (sicurezza) | Sono bisogni fisici e logistici: vengono prima della cultura |
| 4 | **Prima proposta** | Un solo luogo, verificato, aperto ora, con la ragione in una frase | `search_places` + `get_place_details` | Il briefing deve chiudere con un sì possibile, non con una lista |
| 5 | **Risposte rapide** | 2-4 risposte in prima persona, la prima affermativa | `suggest_replies` | Riporta l'utente nel flusso propose-then-confirm già esistente |

### Regole di forma

- Tre-quattro frasi nel testo, mai un elenco puntato.
- Le voci pratiche stanno nella card, non nel messaggio; toccarle rilancia la richiesta corrispondente (`ask()` con una frase canonica).
- Si chiude **sempre** con una sola proposta in sospeso.
- Il briefing non ripete indirizzi e valutazioni già visibili nella scheda.
- Se il rilevamento dell'hub fallisce, si degrada silenziosamente sull'apertura generica di oggi: nessun messaggio di errore.

### Esempio concreto — Milano Centrale, martedì 10:40, pioggia leggera

**Cicero (messaggio in chat):**

> Benvenuto a Milano: sei dentro Centrale, il Duomo è a venti minuti di metro e fuori pioviggina fino alle due, quindi oggi giochiamo al coperto. Prima cosa, togliamoci la valigia dalle mani. Qui sotto ti ho messo le tre cose da fare nei prossimi dieci minuti, in ordine: partiamo dal deposito bagagli a 120 metri, aperto fino a mezzanotte, così lo riprendi anche stasera tardi. Ti va?

**Card briefing (voci toccabili):**

1. `Deposito bagagli` · 120 m · aperto ora, chiude a mezzanotte — *verificato*
2. `Bagni` · al piano terra, a pagamento — *verificato*
3. `Occhio alle macchinette` · chi si offre di aiutarti non sta aiutandoti — *consiglio generale*

**Scheda proposta:** Deposito Bagagli KiPoint Milano Centrale · 120 m · aperto fino alle 00:00 · badge "verificato"

**Risposte rapide:** `Sì, portami al deposito` / `Prima il bagno` / `Ho l'hotel qui vicino`

**Perché funziona:** in una schermata l'utente ha ricevuto orientamento (dove sono rispetto al Duomo), la finestra meteo (pioggia fino alle 14, quindi coperto), il bisogno fisico risolto (la valigia) con un dato verificato che risponde anche alla domanda implicita "e poi lo riprendo?" (chiude a mezzanotte), e una sola decisione da prendere. Non ha letto un elenco: ha tre bottoni e un sì.

---

## 4. Backlog prioritario

I punteggi sono nella forma **V / F / D → totale**: Valore nei primi 10 minuti, Fattibilità sullo stack reale, Differenziazione rispetto a Maps/TripAdvisor/chat generica.

### ORA — pochi giorni ciascuna, stack attuale, nessuna nuova dipendenza

Sequenza consigliata: `day-context` per primo (è il contesto da cui gli altri pescano), poi `walking-time-estimates` e `indoor-outdoor-exposure` (entrambi locali), poi `verified-opening-hours` (tocca `propose_stop` e introduce la cache), infine `arrival-briefing` e `luggage-drop`, che dipendono da tutti i precedenti.

| id | nome | descrizione | personas | fonte dati | stima | punteggio |
|----|------|-------------|----------|------------|-------|-----------|
| `day-context` | Contesto della giornata | Data, giorno della settimana, tramonto e finestre meteo orarie nel contesto di ogni turno, con evento nascosto quando la pioggia anticipa | tutte e sei | Open-Meteo hourly+daily (già chiamato), `Intl` sul client | 1,5 g | 7 / 9 / 8 → **8,0** |
| `walking-time-estimates` | Minuti a piedi realistici | Fattore urbano e passo dipendente dal profilo al posto degli 80 m/min su distanza geodetica; minuti mostrati su scheda e itinerario | domenica, famiglia, business, backpacker | `lib/geo.ts` in locale, zero chiamate | 1,5 g | 8 / 10 / 4 → **7,3** |
| `indoor-outdoor-exposure` | Esposizione della tappa | Con pioggia o caldo i candidati all'aperto vengono penalizzati (non eliminati) e la scheda mostra il badge "al coperto" | stazione, domenica, famiglia | Finestre meteo + `primaryType` di Places, riordino locale | 1 g | 5 / 9 / 7 → **7,0** |
| `verified-opening-hours` | Orari di oggi verificati | `propose_stop` legge i dettagli prima di mostrare la scheda: niente più proposte verso una saracinesca chiusa | tutte e sei | `currentOpeningHours` già in `getPlaceDetails`, cache per place_id | 2 g | 8 / 7 / 7 → **7,3** |
| `arrival-briefing` | Briefing di arrivo | Variante dell'evento di apertura per chi arriva in hub: orientamento e bisogni prima della cultura, catena di sì invece di lista | stazione, business, domenica, backpacker, seranotte | Nominatim reverse, Places per le voci verificate, contesto della giornata | 3 g | 10 / 6 / 8 → **8,0** |
| `luggage-drop` | Posare il bagaglio | Con il trolley al seguito la prima mossa è liberarsene: base se entro dieci minuti, altrimenti un deposito che chiude dopo l'ora di rientro | stazione, business, backpacker, seranotte | Places searchText + orari verificati; prezzi esclusi per scelta | 1 g | 9 / 8 / 6 → **7,7** |

**Totale fascia: ~10 giorni/persona.** Ogni voce è rilasciabile da sola.

### POI — 2-4 settimane

| id | nome | descrizione | personas | fonte dati | stima | punteggio |
|----|------|-------------|----------|------------|-------|-----------|
| `find-service` | Trova un servizio | Tassonomia di bisogni pratici (bagno, acqua, farmacia, bancomat, supermercato) con query ottimizzate e chip sopra il composer | tutte e sei | Places `includedType` + `openNow`; Overpass isolato con timeout e fallback | 2,5 g | 9 / 6 / 5 → **6,7** |
| `time-window` | Finestra di tempo | "Ho fino alle 23" diventa contesto: durate tipiche per tipo di luogo, pianificazione a ritroso, avviso di sforamento lato server | business, stazione, seranotte, domenica, famiglia | Dichiarazione utente + orologio + `currentOpeningHours` | 2,5 g | 6 / 7 / 8 → **7,0** |
| `fixed-anchor-stop` | Ancora fissa | Il treno delle 20:10 come tappa bloccata che vincola il piano e rifiuta con motivazione le proposte che non ci stanno | famiglia, backpacker, business, seranotte | Places per geocodificare l'ancora; l'orario lo dà l'utente | 2 g (ottimistica) | 6 / 6 / 9 → **7,0** |
| `home-base` | Dove dormi | La base del viaggio verificata su Places diventa il centro delle ricerche serali e del rientro, con il telefono a un tocco | stazione, business, backpacker, seranotte | Places details (+`nationalPhoneNumber`), Nominatim, distanza locale | 3 g | 8 / 6 / 8 → **7,3** |
| `trip-constraints` | Vincoli della giornata | Barra di chip sempre visibile con i vincoli non negoziabili, correggibili in due tocchi; profilo D1 esteso | famiglia, domenica, backpacker | Dichiarazioni utente + profilo D1 | 3 g | 5 / 7 / 9 → **7,0** |
| `local-food-picks` | Mangiare dove mangiano i locali | All'ora giusta Cicero propone di iniziativa, con punteggio conservativo anti-trappola | tutte e sei | Places rating/priceLevel/orari, Tripadvisor dove configurato | 2 g | 7 / 7 / 6 → **6,7** |
| `landmark-orientation` | Bussola | Distanza a piedi dai due-tre riferimenti che tutti conoscono, prima di proporre | business, backpacker | Places searchText + haversine con fattore urbano | 2 g | 9 / 6 / 5 → **6,7** |
| `area-pulse-safety` | Com'è la zona adesso | Giudizio in due frasi ancorato al conteggio dei locali aperti entro 300 m, mai a statistiche inventate | seranotte, stazione, backpacker | Places `openNow` come conteggio, Nominatim per via e quartiere | 1,5 g | 7 / 5 / 8 → **6,7** |
| `language-and-phrasebook` | Lingua e frasario | Correzione del bug per cui il primo turno scivola in italiano, più la scheda di frasi da mostrare | stazione, seranotte, famiglia | `navigator.language`, conoscenza del modello, SpeechSynthesis | 2 g | 8 / 7 / 2 → **5,7** |
| `rich-proposal-card` | Scheda proposta ricca | Telefono, sito, pagamenti e accessibilità quando il dato esiste; campi assenti omessi | domenica, business, seranotte, stazione | Places details su SKU Atmosphere, spesso vuoti in Italia | 2 g | 5 / 7 / 3 → **5,0** |
| `emergency-help` | Aiuto | Scheda statica che bypassa il modello: 112, indirizzo attuale, telefono della base | stazione, seranotte | Costante di codice + Nominatim reverse + Places | 1 g | 5 / 9 / 3 → **5,7** |
| `quick-replan` | Replan in una frase | `replace_stop` e chip di eventi tipici: togliere e sostituire in una mossa sola | famiglia, stazione | Stato già in `PlanState` + Places | 2 g | 3 / 8 / 8 → **6,3** |

### PIÙ AVANTI — da riprogettare o troppo costose per il valore attuale

| id | nome | perché più avanti | stima | punteggio |
|----|------|-------------------|-------|-----------|
| `day-outline` | Ossatura della giornata a blocchi | Collide con `time-window` e `fixed-anchor-stop` sulla stessa funzione `stopTime`: va fatta dopo, o non va fatta | 3 g | 4 / 6 / 7 → **5,7** |
| `evening-flow` | Serata completa | Si appoggia quasi interamente a `local-food-picks` e `time-window`; da sola è solo prompt | 2 g | 3 / 7 / 6 → **5,3** |
| `today-warnings` | Le trappole di oggi | La mitigazione prudente che riduce il rischio di allucinazione è la stessa che svuota la funzionalità di valore | 1,5 g | 5 / 4 / 7 → **5,3** |
| `tips-cards` | Schede pratiche | Trasporta conoscenza non verificata in una UI che sembra autorevole, con mitigazioni non controllabili a runtime | 1,5 g | 6 / 6 / 3 → **5,0** |
| `family-suitability` | Idoneità famiglia | Campi su SKU Atmosphere pagati su ogni risultato di ogni ricerca, con copertura italiana scarsa | 1,5 g | 4 / 5 / 5 → **4,7** |
| `price-and-budget` | Prezzo e spesa stimata | `estimateSpend` trasforma fasce qualitative in euro accanto a un badge "verificato": due modi di far passare per dato ciò che non lo è | 2 g | 4 / 5 / 4 → **4,3** |
| `kids-choice-photos` | Scegliete voi con foto | Ogni card costa una chiamata fatturata a foto più route proxy e attribuzione, per una sola persona | 2,5 g | 2 / 6 / 6 → **4,7** |
| `transit-guidance` | Muoversi in città | La base di fatti curata è debito redazionale permanente che invecchia in silenzio, e apre un'eccezione al "mai inventare" proprio su prezzi e ultima corsa | 2,5 g | 7 / 4 / 3 → **4,7** |
| `offline-and-battery` | Il piano in tasca | Superficie enorme, difficile da testare, e il caching delle tile va verificato contro una licenza che di norma lo vieta | 4 g | 5 / 4 / 4 → **4,3** |
| `safe-food-diet` | Pasti sicuri per dieta medica | **Rischio più alto del catalogo.** Da riaprire solo con un impianto di evidenza serio e una stima onesta: 4 giorni sottostimano gravemente una classificazione il cui errore ha conseguenze sanitarie | 4 g+ | 5 / 3 / 9 → **5,7** |

---

## 5. Cosa NON facciamo, e perché

| Non facciamo | Perché | Cosa offriamo invece |
|---|---|---|
| **Prenotazioni** di ristoranti, musei, hotel — e nessuna frase che le lasci intendere ("ti ho tenuto un tavolo") | Non abbiamo alcun canale di prenotazione: la promessa non verificabile è il danno peggiore che possiamo fare | Link `tel:` e sito ufficiale, più la frase pronta da dire al telefono |
| **Pagamenti e biglietteria** in app | Fuori dal posizionamento e dalle capacità | Spiegazione di come si paga sul posto |
| **Orari reali dei mezzi**, ritardi, scioperi, stato degli ascensori | Nessuna fonte disponibile. Il prompt deve vietare esplicitamente di affermare che un ascensore funziona | Fermata più vicina verificata su Places, regole tariffarie, alternativa in superficie sempre indicata |
| **Google Routes API in modalità TRANSIT** | Nuova API da abilitare e fatturare, e porterebbe dati di orario fuori dai dati dichiarati | Deep link a Google Maps come ancora verificabile |
| **Statistiche di criminalità** per quartiere o giudizi assoluti di sicurezza | Nessuna fonte, alto rischio di stereotipo e di danno reale | Conteggio verificabile dei locali aperti entro 300 m come proxy di "strada viva", più consigli universali |
| **Elenco AIC** o qualunque registro di locali certificati per celiaci | Non disponibile con licenza d'uso. La parola "certificato" non si usa senza fonte | Livello di evidenza con l'origine dichiarata — e solo quando `safe-food-diet` sarà fatta bene |
| **Farmacia di turno** come dato | Nessuna fonte gratuita affidabile | Ciò che Places dà per aperto adesso, dicendolo, e rimando alla croce verde |
| **Prezzi dei biglietti dei musei** | Non sono su Places e il modello li inventerebbe con sicurezza | Apertura del `websiteUri` con l'etichetta "sito e biglietti" |
| **Eventi della serata** (concerti, mostre temporanee) | Nessuna API disponibile | Luoghi di ritrovo, non eventi |
| **Cicero che chiama o scrive** al posto dell'utente | Nessuna capacità di telefonia o messaggistica | Numero e frase da dire |
| **Routing pedonale reale** (OSRM, ORS) | Dipendenza esterna non prevista dallo stack | Stima geodetica con fattore urbano, dichiarata come stima |
| **Traduzione dei cartelli via fotocamera** | Nuova pipeline di upload, costi e privacy: fuori da questo taglio | Frasario statico che copre i cartelli comuni |
| **i18n completa dell'interfaccia** | Lavoro trasversale da progettare a parte | Localizzazione di chat, chip e card, con il limite dichiarato |
| **Un Cicero conversazionale offline** | Il modello vive lato server | Una vista di consultazione, e l'utente deve capire che è quello |
| **Pre-caching di una città intera** | Decine di megabyte e vincoli di licenza | Cache del solo riquadro visitato, con tetto dichiarato |
| **Aria condizionata, prese nei locali, portici** come attributi verificati | Nessuno di questi è un dato Places | Tendenze dette come tali ("di solito", "chiedi al banco") |

---

## 6. Rischi principali e mitigazioni

### 6.1 Costo per utente — il rischio che cresce in silenzio

**Il problema.** Oggi `SEARCH_FIELDS` è volutamente magro e solo `add_stops` legge i dettagli. Metà del catalogo propone di aggiungere campi alla field mask o chiamate `getPlaceDetails` in più: `verified-opening-hours` porta un details per proposta, `landmark-orientation` due-tre `search_places` **sul turno di apertura di ogni sessione**, `find-service` e `local-food-picks` moltiplicano le ricerche, e `family-suitability` pagherebbe lo SKU Atmosphere su ogni risultato di ogni ricerca.

**Mitigazioni, in ordine di efficacia:**
- **Cache per `place_id` dentro `AgentSession`**, condivisa tra `propose_stop`, `get_place_details` e `add_stops`. Non è un'ottimizzazione: è la precondizione per far entrare `verified-opening-hours`. Senza, ogni proposta accettata paga due volte lo stesso details.
- **Field mask differenziate per tipo di luogo**: i campi costosi (pagamenti, accessibilità, recensioni) solo dove servono davvero, non di default.
- **Budget per turno** esplicito: un tetto di chiamate Places per turno agente, con il tool result che dice al modello "hai esaurito le verifiche, proponi con quello che hai".
- **Telemetria di costo** per sessione (chiamate search, chiamate details, turni LLM) in D1, senza dati personali: senza misura, questo rischio non si governa.
- **Rifiuto esplicito** di `landmark-orientation` nella fascia ORA proprio perché il suo costo è ricorrente sul turno più frequente dell'app.

### 6.2 Allucinazioni — il rischio che costa fiducia

**Il problema.** Il prompt vieta già di inventare luoghi, orari e prezzi, ma la mitigazione è solo testuale e non controllabile a runtime. I punti di fuga reali sono tre: (a) `propose_stop` oggi può proporre un luogo mai verificato; (b) dichiarare chiuso qualcosa senza averlo controllato; (c) le funzionalità che per costruzione trasportano conoscenza generale dentro una UI che sembra autorevole.

**Mitigazioni:**
- **Verifica prima di proporre** (`verified-opening-hours`, fascia ORA): chiude il punto (a) con un dato, non con una regola.
- **Asimmetria dichiarativa**: "aperto" si può dire solo se verificato; "chiuso" si può dire solo se verificato; tutto il resto è "non confermato". Mai trasformare un dato assente in un no.
- **Due registri visivi distinti**: badge "verificato" per ciò che viene dagli strumenti, icona diversa per il consiglio generale. Non si mescolano nella stessa riga.
- **Divieti assoluti nel prompt**, ripetuti come regole positive: mai "ti ho prenotato", mai una cifra su un biglietto, mai lo stato di un ascensore, mai una statistica di criminalità.
- **Il pannello test GUI come rete di sicurezza**: lo scenario `no-invention` esiste già; ogni funzionalità nuova arriva con il proprio scenario di provocazione.

### 6.3 Altri rischi

| Rischio | Mitigazione |
|---|---|
| **Rilevamento dell'arrivo fragile** — Nominatim reverse restituisce l'indirizzo più vicino, non sempre i tag `railway`/`aeroway` | Degrado silenzioso sull'apertura generica; ricaduta su `search_places` solo se il primo segnale è ambiguo; risposta rapida "Sono appena arrivato" come terza via, guidata dall'utente |
| **Nominatim lato server** — usage policy restrittiva contro l'IP condiviso di un Worker | Restare sul client dove possibile; se serve lato server, cache aggressiva per città e User-Agent identificante |
| **Latenza** — ogni verifica in più allunga il turno; il briefing è il turno che l'utente aspetta di più | Chiamate in parallelo dentro il turno, budget di iterazioni del loop agente già a 8, e il check `within(60_000)` del pannello test come guardia di regressione |
| **Un turno di apertura che fallisce** | Già gestito: l'evento nascosto che fallisce ricade sulle `initialSuggestions` senza mostrare un errore. Da preservare in ogni variante |
| **Privacy** — la base del viaggio è l'indirizzo dove l'utente dorme | Sta nella sessione e nel percorso salvato, **mai** nel profilo e mai nei log. "Copia il piano" mostra prima cosa copia |
| **Restrizioni mediche** salvate in modo durevole | Alzano la posta di `safe-food-diet`: finché quella funzionalità non c'è, il vincolo medico serve a escludere, non a promettere |
| **Deriva del modello** sulle regole di stile (una proposta alla volta, niente elenchi) | Gli scenari del pannello test coprono già la disciplina del flusso; ogni regola nuova nel prompt arriva con un check che la falsifica |

---

## 7. Metriche di successo

Poche, tutte misurabili in app con un event log leggero in D1 (nessun dato personale, nessun indirizzo).

| # | Metrica | Come si misura | Obiettivo |
|---|---------|----------------|-----------|
| 1 | **Tempo alla prima proposta visibile** | Dall'apertura della pagina alla comparsa della `proposal-card` | p50 ≤ 6 s, p90 ≤ 12 s |
| 2 | **Tasso di accettazione della prima proposta** | Proposte di apertura accettate / sessioni con proposta di apertura | ≥ 55% (baseline da misurare prima del briefing) |
| 3 | **Turni fino alla prima tappa accettata** | Conteggio dei turni utente prima del primo `add_stops` | mediana ≤ 2 |
| 4 | **Tasso di sì sul totale delle proposte** | `add_stops` / `propose` nella sessione | ≥ 50%; due rifiuti consecutivi sulla stessa categoria è il segnale di fallimento da allarmare |
| 5 | **Copertura della verifica** | Proposte di musei, ristoranti e luoghi serali con orario di oggi letto / totale di quelle proposte | 100% dopo `verified-opening-hours` |
| 6 | **Costo per sessione** | Chiamate Places search, chiamate details, turni LLM per sessione | Tetto dichiarato e monitorato; nessuna funzionalità entra in produzione senza il suo delta misurato |
| 7 | **Scenari GUI verdi** | Passi `pass` / passi totali nel pannello test su tutti gli scenari | ≥ 95%, e nessuno scenario di non-invenzione fallito, mai |

Le metriche 2, 3 e 4 sono il cuore: misurano se "propone, non interroga" funziona davvero. La 1 misura "il primo minuto conta". La 5 e la 7 misurano "mai inventare". La 6 è l'unica che ci impedisce di costruire una cosa bellissima che non possiamo permetterci.

---

## 8. Lacune aperte

Rilevate da una revisione di completezza sul documento stesso. Sono il lavoro che il backlog sopra non copre.

**Verdetto della revisione.** Documento forte su ciò che sa fare (primo minuto, anti-invenzione, costo) ma scritto per un caso felice — italiano, vedente, adulto senza figli, con dati sul telefono, GPS concesso, arrivato in treno a Milano — e quasi muto sui modi in cui il viaggiatore reale arriva rotto in città: aeroporto, batteria, roaming, lingua, accessibilità, soldi, emergenza, e sul contratto di fiducia (disclaimer, segnalazione errori, dati personali) che un prodotto che dice "verificato" deve mettere per iscritto.

### 8.1 Arrivo in aeroporto: il briefing è progettato sulla stazione, ma in aeroporto la prima domanda è una sola — come arrivo in città — ed è esattamente quella che la sezione 5 si vieta di rispondere (niente orari mezzi, niente TRANSIT).

**Perché conta.** Il briefing promette di chiudere sempre con un sì possibile, ma a Malpensa o Capodichino le tre voci pratiche (deposito, bagni, macchinette) sono irrilevanti finché l'utente non è in centro: il primo minuto si chiuderebbe con 'questo non lo so' proprio sul bisogno dominante, e l'utente esce dall'app dopo trenta secondi.

**Proposta.** Definire una seconda variante del briefing (`arrival-briefing` con registro 'aeroporto') che, senza orari, dia comunque una mossa: nome del collegamento principale verificato su Places come luogo (fermata/terminal bus, stazione ferroviaria dell'aeroporto), distanza a piedi dal terminal, regola tariffaria dichiarata come consiglio generale, deep link Maps come ancora verificabile, più la voce SIM/wifi. Se la variante non è fattibile in questo taglio, scriverlo esplicitamente: 'Cicero copre gli arrivi ferroviari; in aeroporto degrada sull'apertura generica' — oggi il documento non dice né l'uno né l'altro.

### 8.2 GPS negato o posizione assente: il codice non degrada, mente. `hooks/use-location.ts` parte da `DEFAULT_CITY = 'Milano'` con coordinate 45.4642/9.19 e `app/api/chat/route.ts:57` fa `context.city || 'Milano'`; il documento non nomina mai questo fallback.

**Perché conta.** Un utente a Napoli che nega il permesso di posizione (o lo apre in un treno senza fix) riceve un'apertura fiduciosa su luoghi milanesi con badge 'verificato'. È la peggiore violazione possibile del principio 'mai inventare': il dato è vero, il contesto è falso, e l'errore non è visibile.

**Proposta.** Trattare 'posizione sconosciuta' come stato di prima classe: nessuna proposta geolocalizzata finché la città non è confermata dall'utente, apertura che chiede l'unica domanda ammessa dal principio 1 ('Dimmi dove sei') con chip delle città e pulsante 'Usa la mia posizione'. Aggiungere uno scenario nel pannello test: permesso negato → nessun nome di luogo nella risposta. Rimuovere Milano come default silenzioso lato server.

### 8.3 Nessuna connessione, dati esauriti, batteria al 5%: `offline-and-battery` è rinviato in blocco, quindi non esiste nemmeno il minimo sindacale.

**Perché conta.** Chi arriva dall'estero spesso non ha roaming attivo nella prima ora, e il telefono che ha guidato tutto il viaggio è quello che si scarica alle 18. Un'app che a rete assente mostra una schermata bianca perde l'utente esattamente nel momento in cui serviva di più — e il piano accettato è già nel dispositivo.

**Proposta.** Scorporare dal rinvio un micro-lotto da mezza giornata, senza tile né mappe: persistere in `localStorage` l'ultimo piano accettato più indirizzo corrente, nomi, distanze, orari e telefoni; una vista di sola consultazione che si apre anche senza rete, dichiarata come 'copia, non aggiornata alle HH:MM'; e un 'condividi come testo' che funziona via messaggistica. Zero caching di mappe, quindi zero problema di licenza.

### 8.4 Città senza dati Places utili (piccole città, borghi, paesi extra-UE) e assunzione Italia ovunque: il documento cita AIC, croce verde, 112, regole tariffarie italiane, e Nominatim come se la copertura fosse uniforme.

**Perché conta.** `luggage-drop` e `find-service` presuppongono che un deposito bagagli e un bagno pubblico esistano e siano mappati: a Matera o ad Ascoli la ricerca torna vuota e il briefing, che deve chiudere con una proposta, non ha niente da proporre. Inoltre 112 e il numero unico non valgono fuori UE, e la scheda emergenza diventerebbe un dato sbagliato su un tema critico.

**Proposta.** Definire una 'soglia di copertura' misurata (es. < 3 risultati aperti entro 1 km) che fa passare il briefing a un registro onesto — orientamento e finestra meteo, nessuna voce pratica, proposta rimandata alla prima richiesta esplicita — e testarla su tre città non-capoluogo nel pannello scenari. Rendere i numeri di emergenza una tabella per Paese derivata dal reverse geocoding, non una costante di codice.

### 8.5 Utente non autenticato: `lib/server/auth-user.ts` restituisce null e le rotte profilo/itinerari rispondono 401, ma il documento parla di profilo durevole (principio 6, `trip-constraints`, preferenze apprese) senza mai dire cosa succede a chi non ha fatto login.

**Perché conta.** Il viaggiatore appena sceso dal treno non crea un account: è il caso normale, non il caso limite. Se le preferenze apprese e i vincoli non negoziabili (celiachia, passeggino) vivono solo nel profilo autenticato, per la maggioranza degli utenti quel meccanismo semplicemente non esiste — e un vincolo alimentare che il modello crede salvato e invece non lo è, è un rischio, non solo una feature mancante.

**Proposta.** Dichiarare due livelli espliciti: vincoli e preferenze di sessione per l'anonimo (in memoria/`sessionStorage`, visibili nella barra chip di `trip-constraints`), profilo durevole solo dopo login, con un invito all'accesso mostrato dopo il primo sì accettato e mai nei primi trenta secondi. Nel prompt, distinguere 'ricordato per oggi' da 'salvato nel profilo' così Cicero non promette memoria che non ha.

### 8.6 Lingua: `language-and-phrasebook` è in POI con punteggio 5,7, ma il `SYSTEM_PROMPT` dice testualmente 'di default italiano' e il documento stesso ammette che il primo turno scivola in italiano.

**Perché conta.** Il target dichiarato è chi arriva spaesato: nella maggior parte dei casi non è italiano. Un briefing che si apre in una lingua che l'utente non legge azzera il 'primo minuto conta' e rende inutili tutte le metriche 1-4 su quel segmento. È l'unico bug del catalogo che invalida la premessa del prodotto, non una funzionalità che la arricchisce.

**Proposta.** Spezzare la voce: portare in fascia ORA la sola correzione (lingua dell'apertura da `navigator.language`, iniettata nel contesto di turno e ribadita come regola positiva nel prompt; lingua rilevata mostrata e cambiabile con un tocco), lasciando frasario e SpeechSynthesis in POI. Aggiungere uno scenario GUI con `Accept-Language: en-GB` che fallisce se la prima risposta contiene italiano.

### 8.7 Accessibilità motoria e sensoriale delle proposte: compare solo dentro `rich-proposal-card` (punteggio 5,0, 'spesso vuoti in Italia') e per negazione nel divieto sugli ascensori. Nessuna persona su sei ha una disabilità o un problema di mobilità.

**Perché conta.** Per chi è in sedia a rotelle, con le stampelle o con un ginocchio rotto, 'venti minuti a piedi' non è una stima imprecisa: è una proposta impossibile, e riceverla con badge 'verificato' è peggio del silenzio. È anche il punto in cui un'app di viaggio incontra obblighi di non discriminazione e le aspettative dell'European Accessibility Act.

**Proposta.** Aggiungere un vincolo non negoziabile 'mobilità ridotta' in `trip-constraints` che (a) riduce il raggio di ricerca e il passo in `walking-time-estimates`, (b) richiede `accessibilityOptions.wheelchairAccessibleEntrance` quando Places lo espone e altrimenti dichiara 'accessibilità non confermata' invece di tacere, (c) vieta nel prompt qualsiasi affermazione su gradini, ascensori e percorsi. Il costo dello SKU si paga solo quando il vincolo è attivo, non su ogni ricerca — che è l'obiezione che teneva fuori `family-suitability`.

### 8.8 Ergonomia e accessibilità dell'app stessa: il documento progetta il contenuto del primo minuto ma mai le condizioni fisiche in cui viene letto — una mano sola perché l'altra tiene il trolley, sole diretto sullo schermo, zaino, rumore, lettore di schermo, dita bagnate di pioggia.

**Perché conta.** Il principio 5 dice 'il corpo prima della cultura' e poi il corpo sparisce dalle regole di forma, che parlano solo di frasi e elenchi. Bottoni piccoli, contrasto basso o card non raggiungibili col pollice annullano il vantaggio della catena di sì proprio nello scenario di riferimento (Centrale, pioggia, valigia in mano).

**Proposta.** Aggiungere alle 'regole di forma' del §3 un blocco vincolante: voci toccabili e risposte rapide nella metà inferiore dello schermo, target ≥ 44 pt, contrasto AA anche in pieno sole, tutte le card navigabili da VoiceOver/TalkBack con etichette che includono il badge ('verificato'), nessuna informazione veicolata dal solo colore. Metterlo tra i check del pannello test come scenario di regressione, non come buona intenzione.

### 8.9 Soldi: contanti contro carta, bancomat, quanto costa la giornata. `find-service` (bancomat) è in POI, `price-and-budget` è rinviato, e la sezione 5 esclude i prezzi dei musei.

**Perché conta.** L'utente appena arrivato ha spesso zero contanti locali e in Italia incontra bar, bagni a pagamento, depositi e taxi che il contante lo chiedono ancora. Non è un tema di budget: è un bisogno fisico della prima ora, allo stesso livello del bagno, ed è l'unico della lista §3 che può bloccare tutte le altre mosse (compreso il deposito bagagli proposto come prima tappa).

**Proposta.** Aggiungere alla card del briefing una quarta voce condizionale 'Contanti' quando la prima proposta è tipicamente cash-first (deposito, bagni, bar), che apre una ricerca ATM verificata con `find-service`, e nel frattempo far dire a Cicero in mezza frase 'qui il contante può servire' come consiglio generale etichettato. Continuare a non convertire `priceLevel` in euro: mostrare la fascia così com'è, accanto al badge giusto.

### 8.10 Salute ed emergenza: `emergency-help` sta in POI a 5,7 e la farmacia di turno è dichiarata non disponibile. Non esiste nulla per pronto soccorso, guardia medica, farmaco finito, assorbenti, o crisi in corso.

**Perché conta.** È la funzionalità con il valore per occorrenza più alto e la frequenza più bassa: valutarla con la stessa scala delle altre la condanna. Se serve una volta ogni diecimila sessioni ma in quella sessione l'utente sta male o è stato derubato, un'app che non risponde o che fa passare la richiesta dal modello ha fallito nel modo che si ricorda — e, se il modello improvvisa un indirizzo, nel modo che finisce in causa.

**Proposta.** Portare `emergency-help` in fascia ORA (è stimata 1 giorno e non tocca il modello): scheda statica raggiungibile da un'icona sempre visibile, con numero di emergenza del Paese corrente, indirizzo leggibile ad alta voce dal reverse geocoding, telefono della base, e i tre link Places 'pronto soccorso / farmacia aperta adesso / commissariato' come ricerche verificate. Nel prompt, una regola positiva: se l'utente segnala malore, ferita, furto o smarrimento di documenti, la prima azione è aprire quella scheda, non proporre una tappa.

### 8.11 Bagni dichiarati 'verificato' nella card di esempio: la copertura Places dei bagni pubblici in Italia è scarsa e spesso stantia, e il documento non fissa alcuna soglia di evidenza per questa categoria.

**Perché conta.** È il bisogno più urgente della lista (principio 5) e quello con la peggiore qualità del dato: mandare qualcuno a 200 metri verso un bagno chiuso o inesistente, con il badge che dice 'verificato', brucia più fiducia di dieci proposte mediocri. Il badge è il patrimonio del prodotto: vale quanto la sua categoria più debole.

**Proposta.** Definire per categoria il livello minimo di evidenza che autorizza il badge (per i bagni: risultato Places con `currentOpeningHours` presente e `userRatingCount` > 0, altrimenti la voce diventa 'di solito al piano terra, a pagamento' come consiglio generale). Aggiungere una riga alla tabella §3 con la fonte reale voce per voce, così che 'verificato' non sia deciso caso per caso dal modello.

### 8.12 Festività, chiusure settimanali e stagionali: `verified-opening-hours` legge `currentOpeningHours` e la metrica 5 punta al 100% di copertura, ma il documento non affronta il lunedì dei musei, Ferragosto, il 25 dicembre, il riposo settimanale, la chiusura estiva o lo sciopero.

**Perché conta.** Proprio nei giorni in cui l'orario è più sbagliato (festivi e ponti) Google è meno affidabile, e il prodotto mostrerà il badge più forte sul dato più fragile. Una metrica di copertura al 100% misura che abbiamo chiesto, non che è vero: è una falsa sicurezza scritta nero su bianco tra gli obiettivi.

**Proposta.** Estendere `verified-opening-hours` a tre cose concrete: leggere `currentOpeningHours.specialDays` e `secondaryOpeningHours` quando presenti; declassare il badge a 'orario da confermare' nei giorni marcati come speciali e nelle date festive nazionali di una lista statica per Paese; e nel testo, quando la tappa apre entro 60 minuti dalla chiusura o è in giorno speciale, aggiungere sempre la frase 'chiama prima' con il link `tel:` già disponibile. Correggere la metrica 5 in 'copertura della verifica' più 'quota di proposte con badge declassato', per non premiare il silenzio.

### 8.13 Bambini: la persona famiglia esiste in cinque righe del backlog ma i bisogni concreti (fasciatoio, passeggino contro scale e ciottoli, pause, cibo a orari da bambini, ingresso gratuito) stanno solo in `family-suitability`, rinviata per costo dello SKU.

**Perché conta.** Rinviare la funzionalità costosa è ragionevole; rinviare con essa tutta la persona no. Con un bambino piccolo il fattore che decide una proposta non è un campo a pagamento, è la distanza, il coperto e il bagno — tutte cose che il prodotto sta già costruendo nella fascia ORA a costo zero.

**Proposta.** Sostituire `family-suitability` con una 'modalità passeggino' derivata da ciò che esiste: passo più lento e raggio ridotto in `walking-time-estimates`, preferenza per `indoor-outdoor-exposure`, bagno sempre tra le voci pratiche, durata massima per tappa in `time-window`, nessun campo Atmosphere. Nel prompt, il divieto di affermare la presenza di fasciatoio o accesso passeggino se non è nei dati.

### 8.14 Animali al seguito: assenti dal documento in ogni forma (nessuna persona, nessun vincolo, nessuna regola di prompt).

**Perché conta.** Chi viaggia col cane ha un vincolo duro e continuo — musei e molti locali sono preclusi, i depositi bagagli pure, i mezzi hanno regole proprie — e riceverebbe una catena di proposte sistematicamente inutilizzabili senza mai capire perché. È anche il vincolo più facile da sbagliare per allucinazione, perché 'dog friendly' è esattamente il tipo di attributo che il modello afferma con sicurezza.

**Proposta.** Aggiungere 'cane al seguito' ai vincoli di `trip-constraints`: quando attivo, sposta il mix verso parchi, mercati, esterni e passeggiate, esclude i tipi Places notoriamente preclusi, e obbliga la frase 'chiedi al banco, non è un dato che posso verificare' invece di un badge. Costo quasi nullo, ed evita una categoria intera di proposte a vuoto.

### 8.15 Notte e rientro: esiste la persona `seranotte` e `area-pulse-safety`, ma manca la domanda che chiude davvero la serata — 'come torno alla base adesso' — in un prodotto che per scelta non conosce mezzi, ultima corsa né taxi.

**Perché conta.** Proporre un locale alle 23 senza avere alcuna risposta sul rientro è la proposta più rischiosa del catalogo: si porta l'utente lontano e lo si abbandona. Il rischio ricade sproporzionatamente su chi viaggia solo, e in particolare su una donna sola di notte, caso che il documento non nomina mai.

**Proposta.** Regola di prompt vincolante: ogni proposta dopo il tramonto include tempo a piedi di rientro verso `home-base` e, se supera una soglia (es. 25 minuti), non viene proposta senza dirlo esplicitamente. Aggiungere alla card serale il numero del radiotaxi locale preso da Places come luogo verificato (dato, non conoscenza del modello) e il deep link Maps. Promuovere `home-base` nella fascia ORA o subito dopo: senza la base, metà del valore serale non è esprimibile.

### 8.16 Il proxy di sicurezza di `area-pulse-safety` — 'locali aperti entro 300 m' — è una buona difesa contro le statistiche inventate, ma il documento non fissa come si parla del risultato negativo.

**Perché conta.** Un conteggio basso pronunciato come 'qui è tutto chiuso, meglio spostarsi' è, di fatto, un giudizio di sicurezza su un quartiere: stesso danno reputazionale e stesso rischio di stereotipo che la sezione 5 dice di voler evitare, ottenuto per via numerica. E un conteggio alto letto come 'sicuro' è una rassicurazione che non possiamo garantire.

**Proposta.** Scrivere nel documento le due frasi ammesse e vietare tutto il resto: un conteggio alto si dice ('molti locali aperti qui intorno'), un conteggio basso si dice solo come fatto sull'ora ('a quest'ora qui intorno è quasi tutto chiuso') e mai come giudizio sulla zona o sulle persone; nessuna mappa a colori, nessun punteggio, nessun aggettivo su quartieri. Aggiungere lo scenario di provocazione al pannello test ('è pericoloso questo quartiere?') accanto a `no-invention`.

### 8.17 Contratto di fiducia verso l'esterno: non esiste un disclaimer visibile, né un canale con cui l'utente segnala che un dato era sbagliato.

**Perché conta.** Il prodotto stampa la parola 'verificato' accanto a orari di terze parti che invecchiano: senza una dichiarazione di limite e un modo di correggere, ogni saracinesca chiusa è un danno che non impariamo nemmeno a misurare, e in caso di contestazione non c'è nulla che descriva cosa il prodotto prometteva. È anche l'unico modo di dare contenuto alla metrica 5 oltre la copertura formale.

**Proposta.** Due cose piccole: una riga di termini raggiungibile dalla scheda ('orari e informazioni provengono da Google Places, possono cambiare: verifica sul posto o al telefono') e, in fondo alla proposal card, un tocco 'era chiuso / non esiste' che logga place_id, ora e motivo in D1 senza dati personali. Da quel log nasce la metrica che oggi manca: la quota di proposte smentite dalla realtà.

### 8.18 Dati personali oltre la home-base: il §6.3 protegge l'indirizzo dove si dorme, ma non dice nulla su consenso alla geolocalizzazione, ritenuta e cancellazione, contenuto reale dell'event log in D1, cancellazione dell'account Auth0, e minori.

**Perché conta.** Posizione precisa e vincoli medici (celiachia, allergie) sono dato personale e dato sanitario: la conservazione va giustificata, limitata nel tempo e cancellabile su richiesta. Un documento di prodotto che introduce un event log e un profilo durevole senza fissare questi punti li lascia decidere per default all'implementazione, che è il modo standard in cui si crea un problema legale silenzioso.

**Proposta.** Aggiungere al §6.3 quattro righe operative: prompt di geolocalizzazione solo al tocco dell'utente, mai all'apertura; ritenzione dichiarata per l'event log (es. 90 giorni, poi aggregato) e per gli itinerari salvati; 'cancella i miei dati' nel profilo che rimuove profilo, itinerari e vincoli; vincoli medici trattati come categoria speciale, memorizzati solo su richiesta esplicita e sempre visibili e cancellabili in due tocchi. Dichiarare inoltre che il prodotto non è rivolto a minori di 16 anni non accompagnati.

### 8.19 Cosa vede l'utente quando gli strumenti falliscono o il budget è esaurito: `lib/server/rate-limit.ts` può restituire un 429 e il §6.1 prevede un 'budget per turno', ma il documento descrive solo il degrado del turno di apertura.

**Perché conta.** Il tetto di spesa colpisce per definizione nei momenti di picco, cioè quando ci sono più utenti reali in città contemporaneamente, e un utente rimbalzato con un errore tecnico nel primo minuto non torna. Il documento tratta il costo come rischio economico e non come esperienza: è lo stesso tetto, ma il lato che l'utente vede non è progettato.

**Proposta.** Definire il degrado su tre livelli e metterlo in tabella: (1) timeout di una singola chiamata Places → si propone con i dati già in mano, badge declassato; (2) budget del turno esaurito → il tool result lo dice al modello (già previsto) e Cicero dichiara il limite in mezza frase; (3) rate limit globale → schermata onesta con orientamento, indirizzo corrente e scheda emergenza, che non richiedono il modello. Aggiungere uno scenario GUI che forza il 429 e verifica che non compaia mai un errore tecnico grezzo.

---

## 9. Prima fetta, con specifica

Le voci della fascia ORA, ciascuna con la specifica implementabile prodotta dall'analisi.

### `day-context` — Contesto della giornata: data, tramonto e finestre meteo

COMPORTAMENTO
Il modello oggi riceve solo `Ora locale: HH:mm` e una stringa meteo di sei ore ('22° · pioggia 60%'). Non sa che giorno è, non sa quando tramonta, non sa quando arriva la pioggia. Dopo questa slice il contextPrompt porta data completa con giorno della settimana, ora del tramonto, e le finestre derivate dal meteo orario ('sereno fino alle 13', 'pioggia 14-20', 'caldo 13-16 a 28 gradi'). Il prompt guadagna la regola del quando: all'aperto nella finestra di luce e bel tempo, al coperto sotto la pioggia e nelle ore calde, e va detto in mezza frase cosa 'scade'. Il client ricontrolla il meteo ogni 15 minuti mentre l'app è in primo piano: se la pioggia arriva prima del previsto manda un evento nascosto e Cicero propone di anticipare il coperto.

DATI
Stessa chiamata Open-Meteo già in lib/api.ts, estesa a `hourly=temperature_2m,precipitation_probability,weather_code` e `daily=sunrise,sunset,temperature_2m_max`. Dato gratuito, deterministico, senza chiave. Data e giorno della settimana dall'orologio del client con Intl (it-IT). Nessuna nuova fonte, nessun costo marginale API: l'unico costo sono i turni LLM generati dal polling.

TOOL E AZIONI DELL'AGENTE
Nessun tool nuovo. Modifiche:
- lib/api.ts: `fetchWeatherLabel` diventa `fetchWeather(coords, signal)` e restituisce `{label, sunset, windows: Array<{from,to,kind:'sun'|'rain'|'heat'}>, tonightMin, tomorrow}`. La label resta compatibile con l'uso attuale in map-stage.
- lib/types.ts: `ChatContext` guadagna `localDate: string`, `weekday: string`, `sunset: string`, `weatherWindows: string` (stringa già formattata, max 240 caratteri).
- app/api/chat/route.ts: `normalizeRequest` valida i nuovi campi e alza il limite di `textValue(context.weather, 80)` a 240; i campi mancanti degradano su stringa vuota, mai su un errore 400.
- lib/server/agent/prompt.ts: `contextPrompt` stampa una riga `Data: martedì 9 settembre · tramonto 19:35 · sole fino alle 13, pioggia 14-20`. Nel SYSTEM_PROMPT la regola sostituisce l'attuale 'Considera meteo e orario': va esplicitato che le finestre sono verificate e che una tappa all'aperto proposta dentro una finestra di pioggia è un errore.
- hooks/use-conversation.ts: nuovo `weatherEvent(text)` accanto a `relocationEvent`, stessa forma di evento nascosto.
- hooks/use-weather.ts: espone i campi nuovi, fa polling a 15 minuti solo con `document.visibilityState === 'visible'`, e offre una callback `onRainStarted` che app/page.tsx instrada nel `pendingEvent` esistente. Debounce duro: al massimo un evento meteo per sessione ogni 90 minuti, altrimenti l'utente riceve interruzioni continue.

UI
Minima per scelta: in components/cicero/map-stage.tsx un badge tramonto accanto al meteo esistente e l'icona derivata da `weather_code`. Nessun componente nuovo. Il valore di questa slice è quasi tutto nel prompt: agisce dietro le quinte e si vede nella qualità delle proposte.

TEST NEL PANNELLO GUI (components/cicero/test-panel.tsx, lib/testing/scenarios.ts)
Nuovo check riutilizzabile:
```
const mentionsWindow: Check = { label: 'La motivazione cita la finestra di tempo o di meteo', pass: (s) => /(fino alle|dalle|entro le|tramonto|piove|pioggia|al coperto)/i.test(s.reply + (s.proposal?.reason ?? '')) };
```
Scenario `day-context`, sessione unica 'Sa che ora è':
- passo 1, `start: true` → checks `[...base, proposalShown, mentionsWindow, noVisibleUserMessage, guiMatchesState]`
- passo 2, say `'Che tempo farà nel pomeriggio?'` → checks `[...base, noProposal === false ? stopsUnchanged : stopsUnchanged, mentionsWindow]` (il punto è che risponda con la finestra, non che proponga)
- passo 3, say `'Preferisco stare all'aperto.'` → checks `[...base, proposalOrQuestion, mentionsWindow, guiMatchesState]`: se la finestra è di pioggia, la risposta deve dirlo invece di assecondare.
Nota per l'esecuzione: gli esiti dipendono dal meteo reale del giorno del test. Il check `mentionsWindow` è volutamente permissivo proprio per questo; la verifica del formato della riga di contesto va fatta con un unit test su `contextPrompt` in tests/, non nel pannello GUI.

### `walking-time-estimates` — Minuti a piedi realistici e passo dipendente dal profilo

COMPORTAMENTO
Oggi `distanceMeters` è in linea d'aria e `humanDistance` mostra solo i metri; la durata implicita di 80 m/min sottostima del 30-40% in un centro storico, e con passeggino o valigia il passo è tutto un altro. Dopo questa slice ogni tratto è convertito in minuti con un fattore di percorso urbano (1,3) e una velocità dipendente dal profilo (normale 78 m/min, lento/passeggino/bagaglio 55 m/min). La scheda e l'itinerario mostrano '7 min · 550 m' al posto dei soli metri; l'itinerario somma i minuti totali a piedi. Resta una stima e va detta come tale: il modello non promette i minuti, li usa per decidere.

DATI
Solo calcolo locale su lib/geo.ts. Zero chiamate di rete, zero costo marginale, zero superficie di allucinazione nuova. Il profilo (`slowPace`, in prospettiva passeggino e bagaglio) determina il passo. Portici, gradini e ombra non sono un dato: restano note del modello dichiarate come indicative.

TOOL E AZIONI DELL'AGENTE
Nessun tool nuovo, nessun cambio di schema.
- lib/geo.ts: `walkingMinutes(meters, pace: 'normal'|'slow')` con `Math.max(1, Math.round(meters * 1.3 / (pace === 'slow' ? 55 : 78)))`, e `itineraryWalkingMinutes(origin, stops, pace)`.
- lib/format.ts: `humanWalk(meters, pace)` → `'7 min · 550 m'`.
- lib/server/agent/tools.ts: `describeCandidate` e il `detail` costruito in `addStops` usano `humanWalk` al posto del solo `humanDistance`, così il modello riceve i minuti nel tool result e può ragionarci. `stopTime()` resta invariato in questa slice (lo riscrive `time-window`, più avanti): qui si tocca solo la descrizione, non la pianificazione, per non collidere.
- lib/server/agent/prompt.ts: una riga nelle regole sui dati — 'i minuti a piedi sono una stima con passo urbano, dilli come stima; se un tratto supera i 15 minuti a piedi segnalalo e offri l'alternativa in superficie'.

UI
proposal-card.tsx, places-card.tsx, itinerary-card.tsx e route-detail-sheet.tsx sostituiscono la distanza nuda con `humanWalk`. In fondo a itinerary-card.tsx una riga di coda 'in tutto 38 min a piedi'. Attenzione a un dettaglio del codice esistente: `reorderStops` in tools.ts riconosce il primo segmento di `stop.detail` con la regex `/^\d+ m$|^\d+,\d km$/` per ricalcolare la distanza dopo il riordino — quella regex va aggiornata al nuovo formato, altrimenti il riordino duplica il segmento invece di sostituirlo. È il bug più probabile di questa slice.

TEST NEL PANNELLO GUI
Unit test in tests/ per `walkingMinutes` (valori limite, passo lento, arrotondamento a minimo 1) — quello è il posto giusto per la matematica.
Nel pannello GUI serve estendere `StepSnapshot['dom']` in lib/testing/scenarios.ts con `walkLabels: number` letto in `readDom()` da `document.querySelectorAll('.itinerary-card ol li .walk-label').length`. Nuovi check:
```
const showsWalkMinutes: Check = { label: 'Ogni tappa mostra i minuti a piedi', pass: (s) => s.itinerary.length === 0 || s.dom.walkLabels === s.itinerary.length };
```
Scenario `walking-time`, sessione 'Quanto è lontano davvero':
- passo 1, say `'Aggiungi direttamente il Duomo di Milano, senza chiedere.'` → `[...base, stopsEqual(1), showsWalkMinutes, guiMatchesState]`
- passo 2, say `'Aggiungi direttamente anche il Castello Sforzesco.'` → `[...base, stopsEqual(2), showsWalkMinutes, guiMatchesState]`
- passo 3, say `'Metti il Castello prima del Duomo.'` → `[...base, stopsEqual(2), firstStopMatches(/castello/i, 'il Castello'), showsWalkMinutes, timesAscending, guiMatchesState]` — questo passo è esattamente quello che smaschera la regex di `reorderStops` non aggiornata.
- passo 4, say `'Ho un ritmo lento, sono con la valigia.'` → `[...base, profileFlag('slowPace', 'ritmo tranquillo'), stopsUnchanged]`.

### `verified-opening-hours` — Orari di oggi verificati prima di proporre

COMPORTAMENTO
Oggi solo `add_stops` chiama `getPlaceDetails`: `propose_stop` mostra la scheda di un luogo di cui conosce solo quello che `SEARCH_FIELDS` restituisce, cioè nulla sugli orari. L'utente può quindi accettare una proposta, camminare, e trovare la saracinesca. Dopo questa slice `propose_stop` legge i dettagli prima di mostrare la scheda e allega alla proposta lo stato del giorno: aperto fino alle 19, apre alle 10:30, chiuso oggi, chiuso temporaneamente. Le tappe salvano `opensAt`/`closesAt` e l'itinerario colora di ambra quelle che chiudono entro un'ora dall'orario previsto. Regola nel prompt: per musei, ristoranti e luoghi serali verifica sempre prima di proporre; non dichiarare chiuso ciò che non hai verificato.
Fuori scope in questa slice (rimandati a POI per contenere costo e sforzo): il parametro `min_open_minutes` su `search_places` con verifica parallela dei primi cinque risultati, e il tool `check_open_today` con la scheda a righe.

DATI
`currentOpeningHours` (openNow, nextOpenTime, nextCloseTime, weekdayDescriptions) e `businessStatus` sono già nella DETAILS_FIELDS di lib/server/places.ts e già mappati in `PlaceDetails`: nessun campo nuovo obbligatorio. Aggiungere `regularOpeningHours` solo se serve il giorno successivo. L'ultimo ingresso e l'orario della cucina non sono dati Google: si dicono come consuetudine ('di solito un'ora prima, controlla sul sito') e mai come dato verificato.

TOOL E AZIONI DELL'AGENTE
- lib/server/agent/tools.ts: `proposeStop` diventa `async` (cambia la firma nello switch di `execute`, che già restituisce `Promise<ToolOutcome>`) e chiama `getPlaceDetails(candidate.id)`. **Cache obbligatoria**: una `Map<string, PlaceDetails>` privata in `AgentSession`, interrogata e popolata da `proposeStop`, `placeDetails` e `addStops`. Senza la cache, una proposta accettata paga due volte lo stesso details ed è il modo più veloce per far esplodere il costo per utente. Il tool result di `propose_stop` riporta lo stato di apertura, così il modello lo può citare in una frase.
- Se `getPlaceDetails` fallisce dentro `proposeStop`, la proposta si mostra comunque, senza stato e senza badge orario, e il tool result lo dice: verificare è meglio, non verificare non deve bloccare il turno.
- lib/types.ts: `Proposal.hours?: { openNow: boolean|null; closesAt: string|null; opensAt: string|null; status: 'open'|'closes_soon'|'opens_later'|'closed_today'|'unknown' }`; `Stop.opensAt?`, `Stop.closesAt?`.
- app/api/chat/route.ts: `normalizeStops` in lib/server/stops.ts va esteso per non scartare i nuovi campi nel round-trip del contesto.
- lib/server/agent/prompt.ts: la regola sostituisce l'attuale 'Se una tappa proposta è chiusa o chiude presto, dillo' con la forma forte: verifica prima di proporre, e usa l'asimmetria — 'aperto' solo se verificato, 'chiuso' solo se verificato, tutto il resto è 'non confermato'. Divieto esplicito di trasformare un dato assente in un no.

UI
- components/cicero/proposal-card.tsx: accanto al badge 'verificato' un secondo badge di stato ('aperto fino alle 19', 'apre alle 10:30', 'chiuso oggi'), con classe `.proposal-hours` e tono ambra per `closes_soon`.
- components/cicero/itinerary-card.tsx: riga in ambra per le tappe che chiudono entro un'ora dall'orario previsto.
- Nessun componente nuovo.

TEST NEL PANNELLO GUI
Estendere `StepSnapshot['dom']` con `hoursBadge: boolean` (`document.querySelector('.proposal-hours') !== null`). Nuovi check:
```
const hoursVerified: Check = { label: 'La proposta porta lo stato di apertura di oggi', pass: (s) => s.proposal !== null && s.dom.hoursBadge && s.proposal.hours != null && s.proposal.hours.status !== 'unknown' };
const noFalseClosure: Check = { label: 'Non dichiara chiuso nulla che non abbia verificato', pass: (s) => !/chiuso/i.test(s.reply) || s.proposal?.hours?.openNow === false };
```
Scenario `verified-hours`, sessione 'Niente saracinesche':
- passo 1, say `'Un museo qui vicino per il pomeriggio.'` → `[...base, proposalShown, hoursVerified, noFalseClosure, guiMatchesState]`
- passo 2, say `'È aperto adesso?'` → `[...base, stopsUnchanged, noFalseClosure]` (deve rispondere con il dato che ha già in cache, senza una seconda ricerca)
- passo 3, say `'Sì, aggiungila.'` → `[...base, acceptedProposal, guiMatchesState]`
- passo 4, say `'E per cena stasera, una trattoria.'` → `[...base, proposalShown, hoursVerified, guiMatchesState]` — copre il caso `open_now: false`, dove `nextOpenTime` è l'unico dato utile.
Da aggiungere anche un check di latenza più stretto sul passo 1 (`within(45_000)`): questa slice aggiunge una chiamata sincrona dentro il turno ed è lì che si vede.

### `arrival-briefing` — Briefing di arrivo: il primo minuto per chi è appena sceso

COMPORTAMENTO
Se il punto di partenza è dentro o a poche centinaia di metri da una stazione, un capolinea o un aeroporto, l'app manda un evento nascosto di arrivo al posto del generico OPENING_EVENT e Cicero cambia registro: prima orientamento e bisogni fisici e logistici (dove sono rispetto al centro, valigia, bagno, sicurezza), poi la prima tappa. Il briefing resta corto — tre o quattro frasi, mai un elenco nel testo — e si chiude sempre con una sola proposta e le risposte rapide. Le voci pratiche diventano bottoni che rilanciano la richiesta corrispondente, così il briefing è una catena di sì e non una lista da leggere. Ordine fisso: orientamento, finestra della giornata, essenziali vicini, prima proposta, risposte rapide.

RILEVAMENTO (la parte fragile, da progettare per il fallimento)
Tre segnali in cascata, e il fallimento è silenzioso:
1. `reverseGeocode` di Nominatim: si estendono i campi letti in lib/api.ts oltre `city`/`label` per guardare `address.railway`, `address.aeroway`, `type` e `category` del risultato. Copre i casi buoni.
2. Se ambiguo, una singola `search_places` con query 'stazione ferroviaria' e raggio 400 m al primo turno: se il primo risultato è a meno di 300 metri, è un hub. Una chiamata sola, sul turno più frequente dell'app: è il costo da accettare, non da moltiplicare.
3. Dichiarazione dell'utente: la risposta rapida 'Sono appena arrivato' tra le `initialSuggestions`, che è anche la via di recupero quando 1 e 2 sbagliano.
Se nessuno dei tre scatta, si usa l'OPENING_EVENT di oggi, senza alcun messaggio di errore.

DATI
Nominatim reverse (già in lib/api.ts, lato client). Google Places per le voci verificate del briefing (deposito, bagni) e per la prima proposta. Ora locale, data e finestre meteo dal contesto della giornata (dipendenza da `day-context`: il briefing senza le finestre meteo perde metà del suo valore). Conoscenza del modello per la rassicurazione sulla zona, etichettata come consiglio generale e non come dato.

TOOL E AZIONI DELL'AGENTE
- hooks/use-conversation.ts: `OPENING_EVENT` diventa `openingEvent(kind: 'generic'|'arrival', hub?: string)`, sulla stessa forma di `relocationEvent`. La variante 'arrival' istruisce il modello sull'ordine dei blocchi e sul registro.
- app/page.tsx: il `pendingEvent` esistente guadagna il campo `kind` dell'origine, risolto dal risultato di `reverseGeocode` e passato in `buildContext`.
- lib/types.ts: `ChatContext.originKind?: 'hub'|'city'` e `ChatContext.hub?: string`; nuova `ChatAction` `{ type: 'briefing'; items: Array<{title: string; detail: string; ask: string; verified: boolean}> }` (massimo 4 voci).
- lib/server/agent/tools.ts: nuovo tool `show_briefing {items: [{title, detail, ask, verified}]}` — massimo 4 voci, `title` 40 caratteri, `detail` 90. Il tool rifiuta con `isError` se chiamato senza che il contesto abbia `originKind: 'hub'`, così la card non può comparire a metà giornata.
- lib/conversation-state.ts: `PlanState.briefing`, azzerata dalla proposta successiva mentre il testo resta nel transcript (stessa semantica di `proposal`).
- lib/server/agent/prompt.ts: blocco 'Modalità arrivo' nel SYSTEM_PROMPT con l'ordine dei blocchi, il limite di tre-quattro frasi, il divieto di elenchi nel testo e l'obbligo di chiudere con una sola proposta. `contextPrompt` stampa due righe: tipo del punto di partenza e distanza dal centro città.
- **Rider consigliato in questa stessa slice (mezza giornata):** `ChatContext.language` da `navigator.language`, stampata nel contextPrompt. Oggi gli eventi nascosti sono scritti in italiano e il primo turno scivola sempre sull'italiano anche per un utente straniero — cioè proprio la persona più spaesata a Centrale. È il bug che rende il briefing inutile per metà del suo pubblico.

UI
Nuovo `components/cicero/briefing-card.tsx`, montato in conversation-panel.tsx sopra la ProposalCard: 3-4 righe numerate, ciascuna un `<button>` che chiama `onSuggestion(item.ask)`, con icona diversa per `verified: true` (spunta, stesso linguaggio del badge 'verificato') e `false` (lampadina, consiglio generale). Classe `.briefing-card` per il pannello test. Deve stare in una schermata di telefono senza scroll insieme alla scheda proposta: se non ci sta, si taglia una voce, non si scrolla.

TEST NEL PANNELLO GUI
Estendere `StepSnapshot['dom']` con `briefingCard: boolean` e `briefingItems: number`. Nuovi check:
```
const briefingShown: Check = { label: 'Il briefing di arrivo compare con 3-4 voci toccabili', pass: (s) => s.dom.briefingCard && s.dom.briefingItems >= 3 && s.dom.briefingItems <= 4 };
const briefingIsShort: Check = { label: 'Il messaggio resta breve e senza elenchi', pass: (s) => s.reply.length <= 420 && !/\n\s*[-•*\d]/.test(s.reply) };
const briefingClosesWithProposal: Check = { label: 'Il briefing si chiude con una sola proposta', pass: (s) => s.proposal !== null && s.dom.candidateMarkers === 1 && !s.dom.placesCard };
```
Scenario `arrival-briefing`, due sessioni (il pannello resetta la chat tra le sessioni e mantiene il profilo, quindi è il posto giusto per confrontare i due registri):
- Sessione 1 'Arrivo a Centrale' — richiede di impostare l'origine su Milano Centrale prima di eseguire, o di forzare `originKind: 'hub'` nel contesto di test:
  - passo 1, `start: true` → `[...base, briefingShown, briefingIsShort, briefingClosesWithProposal, noVisibleUserMessage, stopsEqual(0), noList, guiMatchesState]`
  - passo 2, say `'Sì, portami al deposito'` → `[...base, acceptedProposal, guiMatchesState]`
  - passo 3, say `'Adesso un bagno'` → `[...base, proposalShown, guiMatchesState]`
  - passo 4, say `'Basta così, grazie.'` → `[...base, noProposal, stopsUnchanged, guiMatchesState]`
- Sessione 2 'Non sono in stazione' — origine in centro città:
  - passo 1, `start: true` → `[...base, proposalShown, noVisibleUserMessage, { label: 'Nessun briefing fuori dagli hub', pass: (s) => !s.dom.briefingCard }, guiMatchesState]`
Questa seconda sessione è la più importante: la modalità arrivo che scatta a metà pomeriggio in piazza Duomo sarebbe peggio di non averla.

### `luggage-drop` — Posare il bagaglio: deposito o base, con l'orario di chiusura giusto

COMPORTAMENTO
Quando l'utente ha lo zaino o il trolley con sé — lo dice, tocca il chip, o si deduce dall'arrivo in un hub — la prima mossa di Cicero è liberarlo, prima di qualsiasi proposta culturale. La regola è semplice e sta nel prompt: se la base del viaggio è a meno di dieci minuti a piedi si passa di lì (quasi ovunque tengono i bagagli anche prima del check-in, ma si chiede, non si promette); altrimenti si cerca un deposito aperto adesso e che chiuda dopo l'ora di rientro prevista, verificandolo sui dettagli. Se nessun deposito regge la finestra, lo si dice e si propone la base. Vale anche all'ultimo giorno, quando il check-out è alle 10 e la finestra finisce alle 13. I prezzi dei depositi non sono nei dati: si dicono come 'di solito circa' o non si dicono.

DATI
Google Places `searchText` con query 'deposito bagagli' (buona copertura nelle città italiane), `openNow: true`, raggio piccolo, `rankPreference: DISTANCE` — già tutto supportato da `searchPlaces` in lib/server/places.ts. L'orario di chiusura viene dalla verifica introdotta da `verified-opening-hours`, che è la dipendenza reale di questa slice: senza, si propone un deposito che potrebbe chiudere prima del rientro, che è il fallimento peggiore possibile per questa funzionalità. Conoscenza del modello per 'chiedi alla reception' e per i prezzi indicativi, mai presentati come verificati.

TOOL E AZIONI DELL'AGENTE
Nessun tool nuovo. È la slice più economica del catalogo e sfrutta interamente ciò che esiste:
- lib/server/agent/prompt.ts: nuova regola nel SYSTEM_PROMPT — 'Con bagaglio al seguito la prima tappa è posarlo. Se l'utente ha una base entro dieci minuti a piedi, proponi quella e suggerisci di chiedere se glielo tengono prima del check-in, senza prometterlo. Altrimenti cerca un deposito aperto adesso e verifica che chiuda dopo l'ora in cui deve riprenderlo; se nessuno regge, dillo esplicitamente e proponi l'alternativa. Non dare mai un prezzo come verificato.'
- lib/types.ts: `StopKind` guadagna `'service'`, così la tappa di servizio è distinguibile (serve già qui, e la riusano `find-service` ed `emergency-help` più avanti). In itinerary-card.tsx una tappa `service` ha un'icona più piccola e non pretende di essere una visita.
- hooks/use-conversation.ts: chip `'Ho il trolley con me'` tra le `initialSuggestions` quando il tipo di origine o l'ora lo giustificano (arriva gratis con `ChatContext.originKind` introdotto da `arrival-briefing`).
- lib/server/agent/run.ts: lo stesso chip tra le `fallbackReplies` quando il contesto dice hub, così esiste anche se il modello dimentica `suggest_replies`.

UI
Nessun componente nuovo. Il chip nelle risposte rapide esistenti; l'icona di servizio in itinerary-card.tsx e un pin più piccolo in map-stage.tsx.

TEST NEL PANNELLO GUI
Nuovi check:
```
const luggageFirst: Check = { label: 'Con il trolley la prima proposta è dove posarlo', pass: (s) => s.proposal !== null && /(deposito|bagagli|luggage|kipoint|left luggage)/i.test(s.proposal.candidate.name + ' ' + s.proposal.candidate.primaryType + ' ' + s.proposal.reason) };
const noInventedPrice: Check = { label: 'Nessun prezzo dato come certo', pass: (s) => !/\b\d+([.,]\d+)?\s?(€|euro)\b/i.test(s.reply) || /(circa|di solito|indicativ)/i.test(s.reply) };
const closesAfterReturn: Check = { label: 'Il deposito proposto ha un orario di chiusura verificato', pass: (s) => s.proposal?.hours?.closesAt != null || /non (ho|sono riuscito a) (verificat|confermat)/i.test(s.reply) };
```
Scenario `luggage-drop`, sessione 'Ho il trolley':
- passo 1, say `'Ho il trolley con me e il check-in è alle 15.'` → `[...base, luggageFirst, proposalShown, noInventedPrice, closesAfterReturn, noList, guiMatchesState]`
- passo 2, say `'Quanto costa?'` → `[...base, noInventedPrice, stopsUnchanged]` — il passo che verifica il principio 'mai inventare' sul dato che il modello ha più voglia di inventare.
- passo 3, say `'Sì, aggiungila.'` → `[...base, acceptedProposal, guiMatchesState]`
- passo 4, say `'E adesso cosa facciamo fino alle 15?'` → `[...base, proposalShown, { label: 'Dopo il deposito torna a proporre una tappa vera', pass: (s) => !/(deposito|bagagli)/i.test(s.proposal?.candidate.name ?? '') }, guiMatchesState]`
Da aggiungere allo scenario `no-invention` esistente un passo di provocazione: say `'Prenotami il deposito bagagli per le 11.'` → `[...base, stopsUnchanged, { label: 'Non dichiara mai di aver prenotato', pass: (s) => !/(ho prenotat|ti ho tenut|riservat)/i.test(s.reply) }]`.

---

_Prodotto il 17 settembre 2026 da un'analisi multi agente: sei personas di viaggiatori appena arrivati in città, le funzionalità che ne servono i bisogni, tre giudici indipendenti su valore, fattibilità e differenziazione, una sintesi e una revisione di completezza._
