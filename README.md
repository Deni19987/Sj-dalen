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
| `/admin` | Admin för personalen (inloggning med lösenord, se nedan) |

## Kom igång lokalt

```bash
npm install
npm run dev:demo       # bara sajten, med lokal exempeldata (ingen databas behövs)
```

Hela sajten **inklusive admin** lokalt, utan Neon (inbyggd Postgres via PGlite, bilder sparas på disk i
`.local-data/`):

```bash
npm run dev:local      # http://localhost:5173 – admin på /admin: admin@sjodalen.local / "admin"
                       # (ändra med ADMIN_EMAIL och ADMIN_PASSWORD)
```

Ta bort mappen `.local-data/` för att börja om med startdata.

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
`npm run db:setup -- --schema-only` för att bara uppdatera schemat utan att skriva över bilar och bud
(utan flaggan skrivs demobilarna och deras bud över).

**Schemat uppdateras automatiskt vid varje production-deploy på Netlify** (`[context.production]` i
`netlify.toml`) innan sajten byggs, så databasen ligger aldrig efter koden. Det kräver att
`DATABASE_URL` är tillgänglig för *Builds* i Netlify (standard när variabeln har alla scopes);
saknas den avbryts deployen och den gamla sajten ligger kvar. Migreringen körs som en transaktion med
ett lås, så två deployer samtidigt krockar inte. Eftersom deploy previews delar production-databasen
migrerar de inte – **ändringar i `db/schema.sql` måste därför vara bakåtkompatibla** (lägg till kolumner
och tabeller med standardvärden, ta inte bort eller byt namn), så att både gammal och ny kod fungerar.

### Databasen

| Tabell | Innehåll |
| --- | --- |
| `services`, `cars`, `bids`, `reviews`, `faqs` | Publikt innehåll som visas på sajten |
| `bookings` | Tidsbokningar (en bokning per datum + tid) |
| `sell_requests` | "Sälj din bil till oss" |
| `contact_messages` | Kontaktformuläret |
| `images` | Metadata för bilbilder (filerna ligger i Netlify Blobs) |
| `settings` | Webbplatsinställningar (kontaktuppgifter, öppettider, notisbanner) |
| `admin_users` | Adminkonton utöver huvudkontot (lösenord som hash) |

Bud läggs via SQL-funktionen `place_bid`, som kontrollerar minsta bud och att auktionen pågår, och
förlänger auktionen 5 minuter om budet kommer inom de sista 5 minuterna. Bokningar skapas via
`create_booking`. Inkomna bokningar och meddelanden ser ni i Neon Console → Tables.

Bilar, bud, meddelanden, bokningar och innehåll hanteras i admin (`/admin`) – se nedan.

## Admin (`/admin`)

En Apple-inspirerad adminpanel som fungerar på både dator och mobil (flikrad längst ned på mobilen).

| Sida | Vad man kan göra |
| --- | --- |
| **Översikt** | Nyckeltal (pågående auktioner, budvärde just nu, nya meddelanden, sålt denna månad), bud per dag, auktioner som kräver åtgärd, auktioner som slutar snart och senaste händelser |
| **Bilar** | Alla annonser med filter (pågår, avslutade, utkast, sålda) och sök. Skapa/redigera bil, publicera eller spara som utkast, förläng, avsluta nu, markera såld, lägg ut igen, duplicera, ta bort |
| **Bilredigering** | Bilder (se nedan), alla uppgifter, höjdpunkter, sluttid med snabbval, utropspris, budhöjning, reservationspris, intern anteckning, budlista med kontaktuppgifter och live-förhandsvisning av bilkortet. ⌘S sparar, varning vid osparade ändringar |
| **Bud** | Alla bud med budgivarens telefon och e-post, vem som leder, filter per bil, budgivarregister och export till CSV (Excel). Ta bort oseriösa bud |
| **Inkorg** | Kontaktformuläret och "Sälj din bil"-förfrågningar i en Mail-liknande vy: olästa, arkiv, svara via e-post, ring, intern anteckning och *Skapa annons från förfrågan* |
| **Bokningar** | Kommande/dagens/tidigare bokningar per dag. Markera klar, uteblev, avboka (tiden blir ledig igen), anteckningar, export |
| **Innehåll** | Tjänster & priser, vanliga frågor och omdömen – lägg till, redigera, ta bort och ändra ordning |
| **Inställningar** | Telefon, e-post, adress, öppettider och en notisbanner högst upp på sajten |

### Bilder

Välj eller dra in flera bilder på en gång (på mobilen går det också att fota direkt). Bilderna
bearbetas i webbläsaren innan uppladdning:

- beskärs automatiskt till **4:3** (samma format överallt på sajten) och kan sedan justeras i ett
  beskärningsverktyg: dra för att flytta, nyp/scrolla för att zooma, räta upp ±15°, rotera 90°
- sparas som huvudbild 1600×1200, miniatyr 800×600 och ett nedskalat original (för att kunna
  beskära om senare) – sajten laddar alltså aldrig onödigt stora filer
- dra för att ändra ordning (håll in fingret på mobil); första bilden är omslagsbild

Filerna lagras i **Netlify Blobs** (ingår i Netlify, ingen extra konfiguration) och visas via
`/api/images/:id/:variant` med evig cache. Metadata ligger i tabellen `images`.

### Inloggning och konton

Man loggar in med **e-post och lösenord**.

- **Huvudkontot** sätts med miljövariablerna `ADMIN_EMAIL` och `ADMIN_PASSWORD` i Netlify
  (Site configuration → Environment variables). Det fungerar alltid och är reservkontot om någon
  låser ute sig. Lösenordet byts genom att ändra `ADMIN_PASSWORD` (och deploya om).
- **Fler konton** läggs till i admin under *Inställningar → Användare*. Där kan man också ta bort
  konton och byta sitt eget lösenord. Lösenord sparas bara som hash (PBKDF2) i tabellen `admin_users`.
- Konton kan också skapas från terminalen direkt i Neon: `npm run admin:user -- namn@exempel.se`
  (lösenordet frågas efter och skrivs aldrig till någon fil).
- Sätt även `ADMIN_SECRET` (en lång slumpad sträng) som signerar inloggningarna. En inloggning gäller
  1 dag, eller 30 dagar med "Håll mig inloggad". Byts ett lösenord loggas det kontot ut överallt.

### API (`netlify/functions/api.mts` → `server/handler.ts`)

| Metod | Sökväg | |
| --- | --- | --- |
| GET | `/api/services`, `/api/cars`, `/api/reviews`, `/api/faqs` | Innehåll |
| GET | `/api/booked-slots?date=YYYY-MM-DD` | Upptagna tider (utan personuppgifter) |
| POST | `/api/bids` | Lägg bud |
| POST | `/api/bookings` | Boka tid |
| POST | `/api/sell-requests`, `/api/contact` | Formulär |
| GET | `/api/settings` | Kontaktuppgifter, öppettider, notisbanner |
| GET | `/api/images/:id/:variant` | Bilbild (`main`, `thumb`, `source`) |
| * | `/api/admin/*` | Admin (kräver inloggning, se `server/admin.ts`) |

## Publicera på Netlify (befintligt konto)

1. Netlify → **Add new site → Import an existing project** → välj detta GitHub-repo.
2. Bygginställningarna läses från `netlify.toml` (`npm run build`, publicerar `dist`, funktioner i `netlify/functions`).
3. Under *Site configuration → Environment variables*: lägg till `DATABASE_URL` (Neons **pooled**
   anslutningssträng, värdnamnet innehåller `-pooler`), `ADMIN_EMAIL`, `ADMIN_PASSWORD` och `ADMIN_SECRET`.
   Kör `npm run db:setup -- --schema-only` mot databasen när schemat ändrats (t.ex. när admin
   lades till) – det lägger till nya kolumner och tabeller utan att röra befintliga bilar och bud.
4. Deploya. Direktlänkar som `/auktion/volvo-v70-2014` fungerar tack vare SPA-omdirigeringen i `netlify.toml`.

## Struktur

```
src/
  components/   Header, Footer, knappar, bilkort, nedräkning, CarFlow-sektionen …
  pages/        En fil per sida
  admin/        Adminpanelen (egen JS-fil som bara laddas på /admin)
    pages/      Översikt, Bilar, Bilredigering, Bud, Inkorg, Bokningar, Innehåll, Inställningar
    images.ts   Beskärning, nedskalning och uppladdning av bilder
    ui.tsx      Knappar, fält, reglage, sheets, notiser m.m.
  lib/          API-klient, TanStack Query-hooks, formatering, auktionslogik
  data/seed.ts  Startdata (demoläge)
  router.tsx    TanStack Router – alla routes
server/handler.ts          API-logik (validering + SQL)
server/admin.ts            Admin-API (bilar, bilder, inkorg, bokningar, innehåll, inställningar)
server/auth.ts             Inloggning: konton, lösenordshashning och signerade tokens
scripts/admin-user.mjs     Skapa adminkonto direkt i Neon (npm run admin:user)
server/dev-api.ts          Lokalt API för `npm run dev:local` (PGlite + bilder på disk)
netlify/functions/api.mts  Netlify Function som kopplar API:t till Neon
db/schema.sql              Tabeller och SQL-funktioner
db/seed.sql                Startdata
scripts/db-setup.mjs       Kör schema + startdata mot Neon
neon.ts                    Neon-konfiguration (neon deploy)
.claude/skills/            Neons agent-skills (neon skills)
```
