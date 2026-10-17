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
npm run dev:local      # http://localhost:5173 – admin på /admin, lösenord "admin" (ändra med ADMIN_PASSWORD)
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
`npm run db:setup -- --schema-only` för att bara uppdatera schemat utan att skriva över bilar och bud.

### Databasen

| Tabell | Innehåll |
| --- | --- |
| `services`, `cars`, `bids`, `reviews`, `faqs` | Publikt innehåll som visas på sajten |
| `bookings` | Tidsbokningar (en bokning per datum + tid) |
| `sell_requests` | "Sälj din bil till oss" |
| `contact_messages` | Kontaktformuläret |
| `images` | Metadata för bilbilder (filerna ligger i Netlify Blobs) |
| `settings` | Webbplatsinställningar (kontaktuppgifter, öppettider, notisbanner) |

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

### Annonshjälp: Transportstyrelsen, AI och Blocket

I bilredigeringen:

- **Hämta från Transportstyrelsen** – samma flöde som i Carflow. Beställ ett registerutdrag på
  [fordon-fu-regnr.transportstyrelsen.se](https://fordon-fu-regnr.transportstyrelsen.se/) med den
  gemensamma inkorgen som mottagare, skriv registreringsnumret och tryck *Hämta*. Märke, modell, färg,
  miltal, antal ägare och besiktningsdatum fylls i. Bara fordonsuppgifter läses – aldrig ägarens namn
  eller adress. Kräver `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` och `GMAIL_REFRESH_TOKEN` (samma värden
  som i Carflow). `VITE_VEHICLE_LOOKUP_INBOX` ändrar vilken mottagaradress som visas.
- **Mer om bilen** – utförande, hk, drivning, ägare, servicehistorik, nycklar, besiktning, däck,
  utrustning (klickbara val) och fritext. Sparas i `cars.facts` och syns bara i admin.
- **Skriv annonsen med AI** – Google Gemini skriver rubrik, säljtext, beskrivning, skick, höjdpunkter
  och "att känna till" utifrån allt ovan. Kräver `GEMINI_API_KEY` (samma som Carflow); `GEMINI_MODEL`
  är valfri (standard `gemini-flash-latest`, med reservmodeller).
- **Lägg upp på Blocket** – alla fält i Blockets ordning med kopieringsknappar, *Kopiera allt*, pris
  för Blocket och en knapp som sparar alla bilder (delas till Bilder på mobilen).

### Inloggning

Sätt miljövariabeln `ADMIN_PASSWORD` i Netlify (Site configuration → Environment variables), gärna
även `ADMIN_SECRET` (en lång slumpad sträng). Inloggningen ger en signerad token som gäller 1 dag
(30 dagar med "Håll mig inloggad"). Byter man lösenord loggas alla enheter ut.

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

## Admin som app och pushnotiser

**Egen subdomän.** Admin kan nås på t.ex. `admin.sjodalenbilar.se`. Det är samma Netlify-sajt:
lägg till domänen under *Domain management → Add a domain alias* och peka en CNAME-post för `admin` till
sajtens Netlify-adress. På `admin.`-domänen öppnas alltid `/admin`, och "Visa webbplatsen" leder till huvuddomänen.
`/admin` på huvuddomänen (länken "Personal" i sidfoten) fungerar som förut.

**Hemskärmen.** Adminsidorna har en egen appbeskrivning (`public/admin.webmanifest`) och ikon, så "Lägg till på
hemskärmen" startar admin som en app. På iPhone kräver notiser att admin öppnas från hemskärmen (iOS 16.4+).

**Pushnotiser** (samma upplägg som i Carflow, `server/push.ts`, `src/admin/push.ts`, `public/sw.js`): varje enhet
slår på notiser under Inställningar och väljer nya bud, nya bokningar och/eller nya meddelanden. VAPID-nycklarna
skapas automatiskt första gången och sparas i databasen – inget behöver ställas in. Vill man styra dem själv sätts
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (och ev. `VAPID_SUBJECT`) i Netlify. Utloggning stänger av notiserna på
enheten; de slås på igen vid nästa inloggning.

## Chatt, e-post och auktionsflöde

**Chatt** (`server/chat.ts`, `src/components/chat/`, admin → Inkorg): kunden startar en chatt från bilsidan
("Frågor om bilen?") med e-post + meddelande. Kontaktformuläret och "Sälj din bil" startar också en chatt, så att
allt besvaras i Inkorgen. Båda sidor frågar efter nytt var 2,5 s medan chatten är öppen; kunden ser verkstadens
namn (Inställningar → Chatten) med grön prick när personalen är inne och tre punkter när hen skriver, annars hur
snabbt verkstaden brukar svara (median, börjar på 2 min). Kontaktmeddelanden och säljförfrågningar från före
chatten flyttas in automatiskt.

**E-post** (`server/mail.ts`): personalen trycker *Anslut Gmail* under Inställningar och loggar in hos Google
(behörigheten gmail.send). Samma Google-klient som för registerutdrag används (`GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET`). Första gången ska `https://<sajt>/api/mail/callback` läggas till under *Authorized
redirect URIs* i Google Cloud och Gmail API vara aktiverat. Mejl skickas när kunden fått svar i chatten men inte
är kvar på sajten (ett per frånvaro), när någon blivit överbjuden och när auktionen är slut.

**Auktionsflöde** (`server/auction.ts`, `netlify/functions/auction-checks.mts`, körs var 5:e minut): notis när en
auktion slutar inom en timme och när den är avslutad (vinnare / under reservationspris / inga bud), mejl till
högstbjudande, och påminnelse när betalning eller hämtning dröjer längre än villkoren. På bilens sida i admin
finns *Efter auktionen* med stegen Vinnaren kontaktad → Betald → Hämtad. Kontrollen kan köras för hand med
`POST /api/admin/checks`.

## Publicera på Netlify (befintligt konto)

1. Netlify → **Add new site → Import an existing project** → välj detta GitHub-repo.
2. Bygginställningarna läses från `netlify.toml` (`npm run build`, publicerar `dist`, funktioner i `netlify/functions`).
3. Under *Site configuration → Environment variables*: lägg till `DATABASE_URL` (Neons **pooled**
   anslutningssträng, värdnamnet innehåller `-pooler`), `ADMIN_PASSWORD` och `ADMIN_SECRET`.
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
server/auth.ts             Inloggning med signerad token
server/dev-api.ts          Lokalt API för `npm run dev:local` (PGlite + bilder på disk)
netlify/functions/api.mts  Netlify Function som kopplar API:t till Neon
db/schema.sql              Tabeller och SQL-funktioner
db/seed.sql                Startdata
scripts/db-setup.mjs       Kör schema + startdata mot Neon
neon.ts                    Neon-konfiguration (neon deploy)
.claude/skills/            Neons agent-skills (neon skills)
```
