# Sjödalen Bilar AB – webbplats

Bilverkstad och bilauktion. Byggd med **React + TypeScript (Vite)**, **TanStack Router**,
**TanStack Query**, **Tailwind CSS** och **Supabase** som databas. Hostas på **Netlify**.

## Sidor

| Sökväg | Innehåll |
| --- | --- |
| `/` | Startsida |
| `/tjanster` | Tjänster och riktpriser |
| `/boka` | Tidsbokning (`/boka?service=svc-diagnos` förväljer tjänst) |
| `/om-oss`, `/kontakt`, `/faq` | Om oss, kontaktformulär, vanliga frågor |
| `/auktion` | Pågående bilauktioner (filter + sortering) |
| `/auktion/:id` | Bilsida med budgivning, nedräkning och budhistorik (live via Supabase Realtime) |
| `/auktion/salj` | Sälj din bil till oss |
| `/auktion/salda` | Sålda bilar |

## Kom igång lokalt

```bash
npm install
cp .env.example .env   # fyll i dina Supabase-uppgifter
npm run dev
```

Utan `.env` körs sidan i **demoläge**: allt innehåll visas från `src/data/seed.ts` och bud/bokningar
sparas bara i minnet. Bra för att förhandsgranska innan databasen är kopplad.

## Koppla till ert befintliga Supabase-projekt

1. Öppna projektet i Supabase → **SQL Editor**.
2. Kör hela `supabase/migrations/20261006000000_init.sql` (skapar tabeller, säkerhetsregler och funktioner).
3. Kör `supabase/seed.sql` (lägger in tjänster, bilar, bud, omdömen och FAQ – samma innehåll som i designen).
4. Hämta **Project URL** och **anon/publishable key** under *Project Settings → API* och lägg dem i `.env`.

Alternativt med Supabase CLI: `supabase link --project-ref <ref>` och sedan `supabase db push`.

### Databasen

| Tabell | Vem kan läsa | Vem kan skriva |
| --- | --- | --- |
| `services`, `cars`, `bids`, `reviews`, `faqs` | Alla | Bara ni (Supabase-dashboard / service role) |
| `bookings` | Bara ni | Besökare via funktionen `create_booking` |
| `sell_requests`, `contact_messages` | Bara ni | Besökare (insert) |

Bud läggs via funktionen `place_bid`, som kontrollerar minsta bud och att auktionen pågår, och
förlänger auktionen 5 minuter om budet kommer inom de sista 5 minuterna. Samma tid kan inte
dubbelbokas. Inkomna bokningar, säljförfrågningar och meddelanden ser ni i *Table Editor*.

**Lägga ut en ny bil:** lägg till en rad i `cars` (sätt `ends_at` och `status = 'active'`).
**Markera såld:** sätt `status = 'sold'` och `sold_price`.

## Publicera på Netlify (befintligt konto)

1. Netlify → **Add new site → Import an existing project** → välj detta GitHub-repo.
2. Bygginställningarna läses från `netlify.toml` (`npm run build`, publicerar `dist`).
3. Under *Site configuration → Environment variables*: lägg till `VITE_SUPABASE_URL` och
   `VITE_SUPABASE_ANON_KEY`.
4. Deploya. `netlify.toml` innehåller redan SPA-omdirigeringen så att direktlänkar som
   `/auktion/volvo-v70-2014` fungerar.

## Struktur

```
src/
  components/   Header, Footer, knappar, bilkort, nedräkning, CarFlow-sektionen …
  pages/        En fil per sida
  lib/          Supabase-klient, API, TanStack Query-hooks, formatering, auktionslogik
  data/seed.ts  Startdata (demoläge)
  router.tsx    TanStack Router – alla routes
supabase/
  migrations/   Databasschema
  seed.sql      Startdata
```
