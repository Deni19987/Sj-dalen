# Sjödalen Bilar AB – webbplats

Bilverkstad och bilauktion. Byggd med **React + TypeScript (Vite)**, **TanStack Router**,
**TanStack Query**, **Tailwind CSS** och **Neon** (Postgres) som databas. Hostas på **Netlify**,
där ett litet API (Netlify Function) läser och skriver i databasen. Webbläsaren pratar aldrig
direkt med databasen.

```
Webbläsare ──► Netlify (sajten i dist/)
           └─► /api/*  ──► netlify/functions/api.mts ──► Neon Postgres
```

## Sidor

| Sökväg | Innehåll |
| --- | --- |
| `/` | Startsida |
| `/tjanster` | Tjänster och riktpriser |
| `/boka` | Tidsbokning (`/boka?service=svc-diagnos` förväljer tjänst) |
| `/om-oss`, `/kontakt`, `/faq` | Om oss, kontaktformulär, vanliga frågor |
| `/auktion` | Pågående bilauktioner (filter + sortering) |
| `/auktion/:id` | Bilsida med budgivning, nedräkning och budhistorik (uppdateras var 10:e sekund) |
| `/auktion/salj` | Sälj din bil till oss |
| `/auktion/salda` | Sålda bilar |

## Kom igång lokalt

```bash
npm install
npm run dev:demo       # bara sajten, med lokal exempeldata (ingen databas behövs)
```

Med riktig databas och API lokalt:

```bash
neon env pull          # skriver DATABASE_URL och DATABASE_URL_UNPOOLED till .env
npm run dev:full       # netlify dev: Vite + API-funktionen på http://localhost:8888
```

## Neon (databas)

Projektet är kopplat till Neon-projektet `cool-dawn-52544886`, branch `production`.

```bash
npm i -g neon@latest && neon login
neon link --project-id cool-dawn-52544886 --branch production -y
neon deploy            # applicerar neon.ts
neon env pull          # hämtar anslutningssträngarna till .env
npm run db:setup       # skapar tabeller + funktioner och lägger in startdata
```

`npm run db:setup` kör `db/schema.sql` och `db/seed.sql` och kan köras flera gånger. Använd
`npm run db:setup -- --schema-only` för att bara uppdatera schemat utan att skriva över bilar och bud.

### Databasen

| Tabell | Innehåll |
| --- | --- |
| `services`, `cars`, `bids`, `reviews`, `faqs` | Publikt innehåll som visas på sajten |
| `bookings` | Tidsbokningar (en bokning per datum + tid) |
| `sell_requests` | "Sälj din bil till oss" |
| `contact_messages` | Kontaktformuläret |

Bud läggs via SQL-funktionen `place_bid`, som kontrollerar minsta bud och att auktionen pågår, och
förlänger auktionen 5 minuter om budet kommer inom de sista 5 minuterna. Bokningar skapas via
`create_booking`. Inkomna bokningar och meddelanden ser ni i Neon Console → Tables.

**Lägga ut en ny bil:** lägg till en rad i `cars` (sätt `ends_at` och `status = 'active'`).
**Markera såld:** sätt `status = 'sold'` och `sold_price`.

### API (`netlify/functions/api.mts` → `server/handler.ts`)

| Metod | Sökväg | |
| --- | --- | --- |
| GET | `/api/services`, `/api/cars`, `/api/reviews`, `/api/faqs` | Innehåll |
| GET | `/api/booked-slots?date=YYYY-MM-DD` | Upptagna tider (utan personuppgifter) |
| POST | `/api/bids` | Lägg bud |
| POST | `/api/bookings` | Boka tid |
| POST | `/api/sell-requests`, `/api/contact` | Formulär |

## Publicera på Netlify (befintligt konto)

1. Netlify → **Add new site → Import an existing project** → välj detta GitHub-repo.
2. Bygginställningarna läses från `netlify.toml` (`npm run build`, publicerar `dist`, funktioner i `netlify/functions`).
3. Under *Site configuration → Environment variables*: lägg till `DATABASE_URL` (Neons **pooled**
   anslutningssträng, värdnamnet innehåller `-pooler`).
4. Deploya. Direktlänkar som `/auktion/volvo-v70-2014` fungerar tack vare SPA-omdirigeringen i `netlify.toml`.

## Struktur

```
src/
  components/   Header, Footer, knappar, bilkort, nedräkning, CarFlow-sektionen …
  pages/        En fil per sida
  lib/          API-klient, TanStack Query-hooks, formatering, auktionslogik
  data/seed.ts  Startdata (demoläge)
  router.tsx    TanStack Router – alla routes
server/handler.ts          API-logik (validering + SQL)
netlify/functions/api.mts  Netlify Function som kopplar API:t till Neon
db/schema.sql              Tabeller och SQL-funktioner
db/seed.sql                Startdata
scripts/db-setup.mjs       Kör schema + startdata mot Neon
neon.ts                    Neon-konfiguration (neon deploy)
.claude/skills/            Neons agent-skills (neon skills)
```
