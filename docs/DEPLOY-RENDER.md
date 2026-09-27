# Cicerone su Render

Cicerone ha due target di build dallo stesso codice:

| | OpenAI Sites (default) | Render |
|---|---|---|
| Runtime | Cloudflare Workers | Node 22 (`vinext start`) |
| Database | D1 | SQLite su disco persistente (`CICERO_SQLITE_PATH`) |
| Build | `npm run build` | `npm run build:node` (`CICERO_PLATFORM=node`) |
| Identità senza Auth0 | header di Sites (se `CICERO_TRUST_SITES_HEADER=1`) | nessuna: serve Auth0 |

Le query sono le stesse: nel build Node `cloudflare:workers` punta a `db/node-env.ts`, che offre la stessa interfaccia di D1 sopra `node:sqlite`. Le tabelle si creano da sole al primo uso.

## Primo deploy

1. Su [dashboard.render.com](https://dashboard.render.com): **New → Blueprint**, collega il repository GitHub `gianlucaorlando/cicero`, ramo `main`. Render legge `render.yaml`.
2. Inserisci nel form i segreti richiesti:
   - `GOOGLE_PLACES_API_KEY` (obbligatoria): se la chiave è limitata per IP, aggiungi gli IP in uscita di Render della regione Francoforte (Dashboard → servizio → *Outbound IPs*);
   - `ANTHROPIC_API_KEY` (obbligatoria), con credito disponibile sul conto;
   - `TRIPADVISOR_API_KEY` (facoltativa): chiave **Terra** (l'API Content di Tripadvisor è stata spenta il 31 agosto 2026);
   - `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` (facoltative, vedi sotto).
3. Conferma: Render installa, esegue `npm run build:node` e avvia `npm run start:node`. Il controllo di salute è `GET /api/health`.
4. Da quel momento ogni push su `main` fa un nuovo deploy (`autoDeployTrigger: commit`).

## Piano e dati

- `render.yaml` usa l'istanza a pagamento più piccola con un disco da 1 GB in `/var/data`: lì vivono i contatori dei limiti di spesa, le cache delle recensioni e, con Auth0, profili e percorsi salvati.
- Sul piano **free** togli il blocco `disk`: l'app funziona lo stesso, ma quei dati si azzerano a ogni riavvio (il servizio gratuito si spegne dopo 15 minuti di inattività). I limiti di spesa giornalieri ripartirebbero da zero a ogni risveglio.
- Con un disco collegato Render non fa deploy senza interruzione: per qualche secondo il sito non risponde durante il cambio versione.

## Login (Auth0)

Su Render non esiste l'identità fornita da OpenAI Sites. Senza Auth0:

- chat, mappa, recensioni e giri funzionano;
- i percorsi si salvano **su questo dispositivo**;
- il profilo resta nella sessione del browser.

Con Auth0, nell'applicazione SPA aggiungi l'indirizzo del servizio (es. `https://cicerone.onrender.com`) a *Allowed Callback URLs*, *Allowed Logout URLs* e *Allowed Web Origins*.

Non impostare `CICERO_TRUST_SITES_HEADER` su Render: fuori dal proxy di Sites quell'header può essere falsificato da chiunque.

## Variabili facoltative

`ANTHROPIC_MODEL`, `CICERO_EFFORT`, `CICERO_RATE_LIMIT`, `CICERO_DAILY_CHAT_BUDGET`, `CICERO_DAILY_DISCOVER_BUDGET`, `CICERO_DAILY_EXPLORE_BUDGET`, `CICERO_DAILY_REVIEWS_BUDGET`: stesso significato che in `.env.example`.

## Provarlo in locale

```bash
npm run build:node
```

```bash
PORT=3200 CICERO_SQLITE_PATH=data/local-node.sqlite npm run start:node
```

Nota: `npm run build:node` sovrascrive `dist/` (anche il build Cloudflare usa quella cartella).
