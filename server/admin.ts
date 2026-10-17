// Admin-API: /api/admin/*. Alla anrop utom inloggningen kräver en giltig token.

import { bearer, checkPassword, createToken, verifyToken, type AuthConfig } from "./auth";
import {
  body,
  bool,
  dbError,
  EMAIL_RE,
  HttpError,
  int,
  json,
  NO_CACHE,
  oneOf,
  optInt,
  str,
  strList,
  text,
  timestamp,
  type BlobStore,
  type Query,
} from "./http";
import { equipmentSuggestions, writeCarAd } from "./ai";
import { AUCTION_DEFAULTS } from "../src/lib/auction";
import { ensureAuctionFlowSchema, runAuctionChecks } from "./auction";
import { handleChatAdmin, unreadConversations } from "./chat";
import { disconnectMail, getMailAccount, mailAuthUrl, mailConfigured, redirectUri, sendMail, siteOrigin } from "./mail";
import { ensurePushTable, getVapid, PUSH_TOPICS, sendPush } from "./push";
import { lookupVehicle, type Env } from "./vehicle-lookup";

const DAY = 24 * 60 * 60 * 1000;
const IMAGE_ID_RE = /^[a-f0-9]{24}$/;
const VARIANTS = ["main", "thumb", "source"] as const;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const BODY_TYPES = ["kombi", "suv", "sedan", "halvkombi", "skåpbil"] as const;
const CAR_STATUSES = ["draft", "active", "sold"] as const;
const SERVICE_CATEGORIES = ["Underhåll", "Reparation", "Besiktning", "Däck", "Övrigt"] as const;

export interface AdminDeps {
  query: Query;
  blobs: BlobStore;
  auth: AuthConfig;
  /** Miljövariabler för AI och hämtning från Transportstyrelsen. */
  env: Env;
}

/* ------------------------------------------------------------------ */
/* Hjälpare                                                             */
/* ------------------------------------------------------------------ */

const randomId = () => {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/å|ä/g, "a")
      .replace(/ö/g, "o")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bil"
  );
}

async function uniqueId(query: Query, table: "cars" | "services", base: string) {
  const rows = await query(`select id from ${table} where id = $1 or id like $1 || '-%'`, [base]);
  const taken = new Set(rows.map((r) => r.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

async function deleteImages(deps: AdminDeps, ids: string[]) {
  if (ids.length === 0) return;
  await deps.query("delete from images where id = any($1::text[])", [ids]);
  await Promise.all(ids.flatMap((id) => VARIANTS.map((v) => deps.blobs.delete(`${id}/${v}`).catch(() => {}))));
}

/** Bilder som laddats upp men aldrig sparats på en bil (t.ex. avbrutet formulär). */
async function cleanupOrphanImages(deps: AdminDeps) {
  const rows = await deps.query(
    `select i.id from images i
      where i.created_at < now() - interval '1 day'
        and not exists (select 1 from cars c where i.id = any(c.images))
      limit 25`,
  );
  await deleteImages(
    deps,
    rows.map((r) => r.id),
  );
}

const CAR_SELECT = `
  select c.*,
    coalesce(
      (select json_agg(json_build_object(
                'id', b.id, 'name', b.name, 'amount', b.amount, 'created_at', b.created_at,
                'email', b.email, 'phone', b.phone, 'terms_version', b.terms_version)
              order by b.created_at)
         from bids b where b.car_id = c.id),
      '[]'::json) as bids
  from cars c`;

async function getCar(query: Query, id: string) {
  const rows = await query(`${CAR_SELECT} where c.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, "Bilen hittades inte.");
  return rows[0];
}

/** Validerar en bil från admin-formuläret och returnerar kolumnvärden i ordning. */
function carValues(b: Record<string, any>) {
  const thisYear = new Date().getFullYear();
  const colorHex = str(b.colorHex, "färgkod", { max: 7 })!;
  if (!/^#[0-9a-fA-F]{6}$/.test(colorHex)) throw new HttpError(400, "Ogiltig färgkod.");
  const images = strList(b.images, "bilder", { maxItems: 40, max: 24 });
  if (images.some((id) => !IMAGE_ID_RE.test(id))) throw new HttpError(400, "Ogiltig bild.");
  const status = oneOf(b.status, "status", CAR_STATUSES);
  // Ett utkast får sparas halvfärdigt; allt krävs först när bilen publiceras.
  const draft = status === "draft";
  const reqText = (v: unknown, field: string, max: number) => (draft ? text(v, field, max) : str(v, field, { max })!);
  const reqInt = (v: unknown, field: string, min: number, max: number) => (draft ? optInt(v, field, min, max) : int(v, field, min, max));
  return {
    make: reqText(b.make, "märke", 60),
    model: reqText(b.model, "modell", 60),
    year: reqInt(b.year, "årsmodell", 1900, thisYear + 1),
    title: reqText(b.title, "rubrik", 120),
    highlight: text(b.highlight, "kort säljtext", 200),
    body_type: oneOf(b.bodyType, "kaross", BODY_TYPES),
    color_name: reqText(b.colorName, "färg", 40),
    color_hex: colorHex,
    mileage_km: reqInt(b.mileageKm, "mätarställning", 0, 3_000_000),
    fuel: reqText(b.fuel, "bränsle", 30),
    gearbox: reqText(b.gearbox, "växellåda", 30),
    inspected: bool(b.inspected),
    condition_summary: text(b.conditionSummary, "skick", 500),
    highlights: strList(b.highlights, "höjdpunkter"),
    things_to_note: strList(b.thingsToNote, "att känna till"),
    description: text(b.description, "beskrivning", 8000),
    start_price: reqInt(b.startPrice, "utropspris", 0, 100_000_000),
    min_increment: draft ? (optInt(b.minIncrement, "budhöjning", 1, 1_000_000) ?? 1000) : int(b.minIncrement, "budhöjning", 1, 1_000_000),
    reserve_price: optInt(b.reservePrice, "reservationspris", 0, 100_000_000),
    ends_at: draft && !b.endsAt ? new Date(Date.now() + 7 * DAY).toISOString() : timestamp(b.endsAt, "sluttid"),
    status,
    sold_price: status === "sold" ? int(b.soldPrice, "slutpris", 0, 100_000_000) : optInt(b.soldPrice, "slutpris", 0, 100_000_000),
    images,
    admin_note: text(b.adminNote, "intern anteckning", 2000),
    reg_number: (text(b.regNumber, "registreringsnummer", 10)).toUpperCase().replace(/\s/g, ""),
    facts: JSON.stringify(carFacts(b.facts)),
  };
}

/** Ett utkast kan sakna uppgifter – kontrolleras innan det publiceras. */
function assertComplete(car: Record<string, any>) {
  const missing = [
    !car.make && "märke",
    !car.model && "modell",
    car.year == null && "årsmodell",
    !car.title && "rubrik",
    !car.color_name && "färg",
    car.mileage_km == null && "mätarställning",
    !car.fuel && "bränsle",
    !car.gearbox && "växellåda",
    car.start_price == null && "utropspris",
  ].filter(Boolean);
  if (missing.length) throw new HttpError(400, `Utkastet saknar ${missing.join(", ")}. Fyll i och spara innan du publicerar.`);
}

/** Extra uppgifter om bilen (för AI-texten och Blocket). Visas bara i admin. */
const FACT_TEXT = ["engine", "owners", "firstRegistered", "lastInspection", "nextInspection", "horsepower", "keys", "serviceHistory", "drive", "tires", "trim"] as const;
function carFacts(v: unknown) {
  const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of FACT_TEXT) {
    const s = typeof f[k] === "string" ? (f[k] as string).trim() : "";
    if (s.length > 100) throw new HttpError(400, "För lång text i bilens uppgifter.");
    if (s) out[k] = s;
  }
  out.equipment = strList(f.equipment, "utrustning", { maxItems: 120, max: 60 });
  out.standardEquipment = strList(f.standardEquipment, "standardutrustning", { maxItems: 120, max: 60 });
  out.optionalEquipment = strList(f.optionalEquipment, "möjliga tillval", { maxItems: 60, max: 60 });
  out.notes = text(f.notes, "anteckningar till AI", 4000);
  return out;
}

const CAR_CAST: Record<string, string> = {
  highlights: "::text[]",
  things_to_note: "::text[]",
  images: "::text[]",
  ends_at: "::timestamptz",
  facts: "::jsonb",
};

/* ------------------------------------------------------------------ */
/* Innehåll (tjänster, FAQ, recensioner)                                 */
/* ------------------------------------------------------------------ */

type ContentType = "services" | "faqs" | "reviews";

function contentValues(type: ContentType, b: Record<string, any>): Record<string, unknown> {
  if (type === "services") {
    const priceFrom = int(b.priceFrom, "pris från", 0, 1_000_000);
    const priceTo = optInt(b.priceTo, "pris till", 0, 1_000_000);
    if (priceTo != null && priceTo < priceFrom) throw new HttpError(400, "”Pris till” måste vara högre än ”pris från”.");
    return {
      category: oneOf(b.category, "kategori", SERVICE_CATEGORIES),
      name: str(b.name, "namn", { max: 80 }),
      description: str(b.description, "beskrivning", { max: 400 }),
      price_from: priceFrom,
      price_to: priceTo,
      duration_min: int(b.durationMin, "tidsåtgång", 5, 24 * 60),
      popular: bool(b.popular),
    };
  }
  if (type === "faqs")
    return {
      question: str(b.question, "fråga", { max: 300 }),
      answer: str(b.answer, "svar", { max: 3000 }),
    };
  return {
    name: str(b.name, "namn", { max: 80 }),
    rating: int(b.rating, "betyg", 1, 5),
    text: str(b.text, "omdöme", { max: 1500 }),
    created_at: timestamp(b.date ?? new Date().toISOString(), "datum"),
  };
}

/* ------------------------------------------------------------------ */
/* Inställningar                                                        */
/* ------------------------------------------------------------------ */

function settingsValue(b: Record<string, any>) {
  const hours = Array.isArray(b.hours) ? b.hours : [];
  if (hours.length > 10) throw new HttpError(400, "För många rader med öppettider.");
  const ann = (b.announcement ?? {}) as Record<string, unknown>;
  const link = text(ann.link, "länk", 300);
  if (link && !/^(\/|https?:\/\/)/.test(link)) throw new HttpError(400, "Länken ska börja med / eller https://");
  const mail = str(b.email, "e-post", { max: 254 })!;
  if (!EMAIL_RE.test(mail)) throw new HttpError(400, "Ogiltig e-postadress.");
  const tone = ann.tone === "warning" ? "warning" : "info";
  const co = (b.company ?? {}) as Record<string, unknown>;
  const orgNumber = text(co.orgNumber, "organisationsnummer", 20);
  if (orgNumber && !/^\d{6}-?\d{4}$/.test(orgNumber))
    throw new HttpError(400, "Organisationsnumret ska ha formatet 556123-4567.");
  const vatNumber = text(co.vatNumber, "momsregistreringsnummer", 20).toUpperCase().replace(/\s/g, "");
  if (vatNumber && !/^SE\d{12}$/.test(vatNumber))
    throw new HttpError(400, "Momsregistreringsnumret ska ha formatet SE556123456701.");
  const au = (b.auction ?? {}) as Record<string, unknown>;
  return {
    phone: str(b.phone, "telefon", { max: 40 }),
    email: mail,
    address: str(b.address, "adress", { max: 200 }),
    hours: hours.map((h: any) => ({ label: str(h?.label, "dag", { max: 40 }), value: str(h?.value, "tid", { max: 40 }) })),
    company: { name: str(co.name, "företagsnamn", { max: 120 })!, orgNumber, vatNumber },
    auction: {
      paymentDays: int(au.paymentDays, "betalningsfrist", 1, 30),
      pickupDays: int(au.pickupDays, "hämtningsfrist", 1, 60),
      storageFee: int(au.storageFee, "förvaringsavgift", 0, 10_000),
      cancelAfterDays: int(au.cancelAfterDays, "dagar innan köpet hävs", 7, 180),
      paymentInfo: text(au.paymentInfo, "betalningsuppgifter", 200),
    } as { paymentDays: number; pickupDays: number; storageFee: number; cancelAfterDays: number; paymentInfo: string; updatedAt?: string },
    chat: {
      staffName: text((b.chat ?? {}).staffName, "namn i chatten", 40),
      quickReplies: strList((b.chat ?? {}).quickReplies, "snabbsvar", { maxItems: 12, max: 500 }),
    },
    announcement: { enabled: bool(ann.enabled), text: text(ann.text, "notis", 200), link, tone },
  };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

// Nya kolumner läggs till automatiskt så att sajten fungerar även om db/schema.sql inte körts om.
let schemaReady: Promise<unknown> | null = null;
export function ensureSchema(query: Query) {
  schemaReady ??= (async () => {
    const cols = await query(
      `select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'cars' and column_name in ('reg_number', 'facts', 'year', 'mileage_km', 'start_price')`,
    );
    const has = (c: string) => cols.some((r) => r.column_name === c);
    const nullable = (c: string) => cols.some((r) => r.column_name === c && r.is_nullable === "YES");
    if (!has("reg_number")) await query("alter table public.cars add column if not exists reg_number text not null default ''");
    if (!has("facts")) await query("alter table public.cars add column if not exists facts jsonb not null default '{}'");
    const bidCols = await query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'bids' and column_name = 'terms_version'`,
    );
    if (bidCols.length === 0) await query("alter table public.bids add column if not exists terms_version text");
    // Utkast får sakna årsmodell, miltal och utropspris.
    for (const c of ["year", "mileage_km", "start_price"])
      if (!nullable(c)) await query(`alter table public.cars alter column ${c} drop not null`);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/* ------------------------------------------------------------------ */
/* Pushnotiser (en prenumeration per enhet, se server/push.ts)          */
/* ------------------------------------------------------------------ */

async function handlePush(req: Request, action: string | undefined, { query, env }: AdminDeps): Promise<Response> {
  await ensurePushTable(query);
  if (req.method === "GET" && !action) return json({ publicKey: (await getVapid(query, env)).publicKey }, 200, NO_CACHE);
  if (req.method !== "POST") throw new HttpError(404, "Hittades inte.");
  const b = await body(req);
  const endpoint = str(b.endpoint, "endpoint", { max: 1000 })!;
  if (!/^https:\/\//.test(endpoint)) throw new HttpError(400, "Ogiltig prenumeration.");
  // API:t pratar om påslagna typer (topics); i databasen sparas de avstängda (muted).
  const mutedFrom = (v: unknown) => (Array.isArray(v) ? PUSH_TOPICS.filter((t) => !v.includes(t)) : []);
  const enabled = (muted: string[] = []) => PUSH_TOPICS.filter((t) => !muted.includes(t));

  switch (action) {
    case "status": {
      const row = (await query("select muted from push_subscriptions where endpoint = $1", [endpoint]))[0];
      return json({ subscribed: !!row, topics: enabled(row?.muted) }, 200, NO_CACHE);
    }
    case "subscribe": {
      const keys = (b.keys ?? {}) as Record<string, unknown>;
      const userAgent = text(b.userAgent, "enhet", 500);
      // Samma enhet som prenumererat förut med en annan adress: ersätt den gamla.
      if (userAgent) await query("delete from push_subscriptions where user_agent = $1 and endpoint <> $2", [userAgent, endpoint]);
      const rows = await query(
        `insert into push_subscriptions (endpoint, p256dh, auth, user_agent, muted) values ($1, $2, $3, $4, $5)
         on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent, updated_at = now(),
           muted = case when $6 then excluded.muted else push_subscriptions.muted end
         returning muted`,
        [endpoint, str(keys.p256dh, "nyckel", { max: 200 }), str(keys.auth, "nyckel", { max: 100 }), userAgent || null, mutedFrom(b.topics), Array.isArray(b.topics)],
      );
      return json({ subscribed: true, topics: enabled(rows[0].muted) }, 200, NO_CACHE);
    }
    case "topics": {
      const rows = await query("update push_subscriptions set muted = $2, updated_at = now() where endpoint = $1 returning muted", [
        endpoint,
        mutedFrom(b.topics),
      ]);
      if (!rows.length) throw new HttpError(404, "Notiser är inte påslagna på den här enheten.");
      return json({ subscribed: true, topics: enabled(rows[0].muted) }, 200, NO_CACHE);
    }
    case "unsubscribe":
      await query("delete from push_subscriptions where endpoint = $1", [endpoint]);
      return json({ subscribed: false, topics: [...PUSH_TOPICS] }, 200, NO_CACHE);
    case "test": {
      const r = await sendPush(query, env, { endpoint }, {
        title: "Testnotis",
        body: "Notiserna fungerar på den här enheten.",
        url: "/admin/installningar",
        tag: "test",
      });
      if (r.sent === 0) throw new HttpError(502, r.errors[0] ? `Notisen kunde inte skickas: ${r.errors[0]}` : "Notiser är inte påslagna på den här enheten.");
      return json({ ok: true }, 200, NO_CACHE);
    }
  }
  throw new HttpError(404, "Hittades inte.");
}

/* ------------------------------------------------------------------ */
/* E-post (Anslut Gmail, se server/mail.ts)                             */
/* ------------------------------------------------------------------ */

async function handleMail(req: Request, action: string | undefined, { query, env }: AdminDeps): Promise<Response> {
  if (req.method === "GET" && !action) {
    const acc = await getMailAccount(query);
    return json(
      { configured: mailConfigured(env), connected: !!acc, email: acc?.email ?? null, connectedAt: acc?.connectedAt ?? null, redirectUri: redirectUri(req) },
      200,
      NO_CACHE,
    );
  }
  if (req.method !== "POST") throw new HttpError(404, "Hittades inte.");
  switch (action) {
    case "connect":
      return json({ url: await mailAuthUrl(query, env, req) }, 200, NO_CACHE);
    case "disconnect":
      await disconnectMail(query);
      return json({ ok: true }, 200, NO_CACHE);
    case "test": {
      const acc = await getMailAccount(query);
      if (!acc) throw new HttpError(400, "E-post är inte ansluten.");
      const r = await sendMail(query, env, {
        to: acc.email,
        fromName: "Sjödalen Bilar",
        subject: "Testmejl från webbplatsen",
        heading: "E-posten fungerar",
        paragraphs: ["Det här är ett testmejl. Så här ser mejlen ut som kunderna får, t.ex. när du svarar i chatten."],
        quote: { from: "Verkstaden", text: "Hej! Bilen finns att titta på vardagar 07.30–17.00." },
        button: { label: "Öppna chatten och svara", url: siteOrigin(req) },
      });
      if (!r.ok) throw new HttpError(502, r.error ?? "Mejlet kunde inte skickas.");
      return json({ ok: true, to: acc.email }, 200, NO_CACHE);
    }
  }
  throw new HttpError(404, "Hittades inte.");
}

export async function handleAdmin(req: Request, path: string, deps: AdminDeps): Promise<Response> {
  const { query } = deps;
  const method = req.method;
  const parts = path.split("/").filter(Boolean).slice(1); // efter "admin"
  const [section, id, sub] = parts.map(decodeURIComponent);

  if (section === "login" && method === "POST") {
    if (!deps.auth.password)
      throw new HttpError(503, "Admin är inte aktiverat. Lägg in miljövariabeln ADMIN_PASSWORD.");
    const b = await body(req);
    const ok = typeof b.password === "string" && (await checkPassword(deps.auth, b.password));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600)); // bromsar gissningsförsök
      throw new HttpError(401, "Fel lösenord.");
    }
    return json(await createToken(deps.auth, b.remember ? 30 * DAY : DAY), 200, NO_CACHE);
  }

  if (!(await verifyToken(deps.auth, bearer(req)))) throw new HttpError(401, "Du är utloggad. Logga in igen.");

  if (section === "push") return handlePush(req, id, deps);
  if (section === "chats") return handleChatAdmin(req, id, sub, query, deps.env);
  if (section === "mail") return handleMail(req, id, deps);
  if (section === "checks" && method === "POST")
    return json({ done: await runAuctionChecks(query, deps.env, siteOrigin(req)) }, 200, NO_CACHE);

  const route = `${method} ${section}${id ? "/:id" : ""}${sub ? `/${sub}` : ""}`;
  if (section === "cars") {
    await ensureSchema(query);
    await ensureAuctionFlowSchema(query);
  }

  switch (route) {
    case "GET session":
      return json({ ok: true }, 200, NO_CACHE);

    /* ---------------- Översikt ---------------- */
    case "GET overview": {
      const unread = await unreadConversations(query); // skapar även chattabellerna första gången
      const [stats] = await query(`
        select
          (select count(*)::int from cars where status = 'active' and ends_at > now()) as active_cars,
          (select count(*)::int from cars where status = 'active' and ends_at <= now()) as ended_cars,
          (select count(*)::int from cars where status = 'draft') as draft_cars,
          (select count(*)::int from cars where status = 'sold' and coalesce(sold_at, ends_at) >= date_trunc('month', now())) as sold_month,
          (select coalesce(sum(sold_price), 0)::float8 from cars where status = 'sold' and coalesce(sold_at, ends_at) >= date_trunc('month', now())) as sold_month_value,
          (select count(*)::int from bids where created_at > now() - interval '24 hours') as bids_24h,
          (select count(distinct lower(name))::int from bids where created_at > now() - interval '30 days') as bidders_30d,
          (select coalesce(sum(greatest(c.start_price, coalesce((select max(amount) from bids b where b.car_id = c.id), 0))), 0)::float8
             from cars c where c.status = 'active' and c.ends_at > now()) as live_value,
          0 as new_messages,
          (select count(*)::int from bookings where date = current_date and status = 'booked') as bookings_today,
          (select count(*)::int from bookings where date >= current_date and status = 'booked') as bookings_upcoming`);

      stats.new_messages = unread;
      const bidsPerDay = await query(`
        select d::date::text as day, coalesce(count(b.id), 0)::int as count
          from generate_series(current_date - 13, current_date, interval '1 day') d
          left join bids b on b.created_at >= d and b.created_at < d + interval '1 day'
         group by d order by d`);

      const activity = await query(`
        (select 'bid' as kind, b.id::text as id, b.name as title, c.title as subtitle, b.amount as amount,
                b.car_id as ref, b.created_at
           from bids b join cars c on c.id = b.car_id order by b.created_at desc limit 12)
        union all
        (select case when c.kind = 'sell' then 'sell' else 'message' end, c.id::text, coalesce(nullif(c.name, ''), c.email),
                left(m.body, 120), null, c.id::text, m.created_at
           from conversation_messages m join conversations c on c.id = m.conversation_id
          where m.sender = 'customer' order by m.created_at desc limit 8)
        union all
        (select 'booking', id, name, service_name || ' · ' || date::text || ' ' || time, null, null, created_at
           from bookings order by created_at desc limit 8)
        order by created_at desc limit 16`);

      return json({ stats, bidsPerDay, activity }, 200, NO_CACHE);
    }

    /* ---------------- Annonshjälp ---------------- */
    case "POST vehicle-lookup": {
      const b = await body(req);
      return json(await lookupVehicle(deps.env, str(b.regNumber, "registreringsnummer", { max: 12 })!), 200, NO_CACHE);
    }

    case "POST ai-ad": {
      const b = await body(req);
      if (JSON.stringify(b).length > 20_000) throw new HttpError(400, "För mycket text.");
      if (!str(b.make, "märke", { max: 60, optional: true }) || !str(b.model, "modell", { max: 60, optional: true }))
        throw new HttpError(400, "Fyll i märke och modell först.");
      return json(await writeCarAd(deps.env, b), 200, NO_CACHE);
    }

    case "POST ai-equipment": {
      const b = await body(req);
      if (JSON.stringify(b).length > 5_000) throw new HttpError(400, "För mycket text.");
      if (!str(b.make, "märke", { max: 60, optional: true }) || !str(b.model, "modell", { max: 60, optional: true }))
        throw new HttpError(400, "Fyll i märke och modell först.");
      return json(await equipmentSuggestions(deps.env, b), 200, NO_CACHE);
    }

    /* ---------------- Bilar ---------------- */
    case "GET cars":
      return json(await query(`${CAR_SELECT} order by c.created_at desc`), 200, NO_CACHE);

    case "GET cars/:id":
      return json(await getCar(query, id), 200, NO_CACHE);

    case "POST cars": {
      const v = carValues(await body(req));
      const newId = await uniqueId(query, "cars", slugify([v.make, v.model, v.year].filter((x) => x != null && x !== "").join(" ") || "utkast"));
      const cols = Object.keys(v);
      await query(
        `insert into cars (id, ${cols.join(", ")}) values ($1, ${cols.map((c, i) => `$${i + 2}${CAR_CAST[c] ?? ""}`).join(", ")})`,
        [newId, ...Object.values(v)],
      ).catch(dbError);
      return json(await getCar(query, newId), 201, NO_CACHE);
    }

    case "PUT cars/:id": {
      const before = await getCar(query, id);
      const v = carValues(await body(req));
      const cols = Object.keys(v);
      const extended = before.ends_at && new Date(before.ends_at).getTime() !== new Date(v.ends_at).getTime() ? ", extended = false" : "";
      await query(
        `update cars set ${cols.map((c, i) => `${c} = $${i + 2}${CAR_CAST[c] ?? ""}`).join(", ")}, updated_at = now()${extended},
                sold_at = case when $${cols.indexOf("status") + 2}::text = 'sold' then coalesce(sold_at, now()) end
          where id = $1`,
        [id, ...Object.values(v)],
      ).catch(dbError);
      const removed = (before.images as string[]).filter((img) => !v.images.includes(img));
      await deleteImages(deps, removed);
      return json(await getCar(query, id), 200, NO_CACHE);
    }

    case "DELETE cars/:id": {
      const car = await getCar(query, id);
      await query("delete from cars where id = $1", [id]);
      await deleteImages(deps, car.images);
      return json({ ok: true }, 200, NO_CACHE);
    }

    case "POST cars/:id/actions": {
      const car = await getCar(query, id);
      const b = await body(req);
      const action = oneOf(b.action, "åtgärd", ["end", "extend", "sell", "relist", "publish", "unpublish", "duplicate", "deal", "dealInfo"] as const);
      switch (action) {
        case "end":
          await query("update cars set ends_at = now(), updated_at = now() where id = $1", [id]);
          break;
        case "extend":
          await query(
            `update cars set ends_at = greatest(ends_at, now()) + make_interval(hours => $2), updated_at = now(),
                    notified_ending_at = null, notified_ended_at = null where id = $1`,
            [id, int(b.hours, "timmar", 1, 24 * 60)],
          );
          break;
        case "sell":
          await query("update cars set status = 'sold', sold_price = $2, sold_at = now(), updated_at = now() where id = $1", [
            id,
            int(b.price, "slutpris", 0, 100_000_000),
          ]);
          break;
        case "relist":
          assertComplete(car);
          if (bool(b.clearBids)) await query("delete from bids where car_id = $1", [id]);
          // Nya priser kan sättas direkt när bilen läggs ut igen (annars behålls de gamla).
          await query(
            `update cars set status = 'active', sold_price = null, sold_at = null, extended = false,
                    ends_at = now() + make_interval(days => $2), updated_at = now(), deal = '{}',
                    notified_ending_at = null, notified_ended_at = null, reminded_payment_at = null, reminded_pickup_at = null,
                    start_price = coalesce($3, start_price), min_increment = coalesce($4, min_increment),
                    reserve_price = case when $5 then $6 else reserve_price end
              where id = $1`,
            [
              id,
              int(b.days, "dagar", 1, 60),
              optInt(b.startPrice, "utropspris", 0, 100_000_000),
              optInt(b.minIncrement, "budhöjning", 1, 1_000_000),
              b.reservePrice !== undefined,
              optInt(b.reservePrice, "reservationspris", 0, 100_000_000),
            ],
          );
          break;
        case "publish":
          assertComplete(car);
          if (new Date(car.ends_at).getTime() <= Date.now())
            throw new HttpError(400, "Sluttiden har redan passerat. Välj en ny sluttid innan du publicerar.");
          await query("update cars set status = 'active', updated_at = now() where id = $1", [id]);
          break;
        // Efter auktionen: Vinnaren kontaktad → Betald → Hämtad (bocka i/ur)
        case "deal": {
          const step = oneOf(b.step, "steg", ["contactedAt", "paidAt", "pickupBookedAt", "ownershipAt", "pickedUpAt"] as const);
          await query(
            bool(b.done)
              ? `update cars set deal = jsonb_set(coalesce(deal, '{}'), array[$2::text], to_jsonb(now())), updated_at = now() where id = $1`
              : `update cars set deal = coalesce(deal, '{}') - $2::text, updated_at = now(),
                        reminded_payment_at = case when $2 in ('contactedAt','paidAt') then null else reminded_payment_at end,
                        reminded_pickup_at = case when $2 in ('paidAt','pickedUpAt') then null else reminded_pickup_at end
                  where id = $1`,
            [id, step],
          );
          break;
        }
        case "dealInfo": {
          const patch: Record<string, string> = {};
          if (b.pickupTime !== undefined) patch.pickupTime = text(b.pickupTime, "hämtningstid", 20);
          if (b.note !== undefined) patch.note = text(b.note, "anteckning", 2000);
          await query("update cars set deal = coalesce(deal, '{}') || $2::jsonb, updated_at = now() where id = $1", [id, JSON.stringify(patch)]);
          break;
        }
        case "unpublish":
          await query("update cars set status = 'draft', updated_at = now() where id = $1", [id]);
          break;
        case "duplicate": {
          // Kopiera bildfilerna så att bilarna kan redigeras oberoende av varandra.
          const copies: string[] = [];
          for (const imgId of car.images as string[]) {
            const newImg = randomId();
            let copied = false;
            for (const v of VARIANTS) {
              const data = await deps.blobs.get(`${imgId}/${v}`);
              if (data) {
                await deps.blobs.set(`${newImg}/${v}`, data);
                copied = true;
              }
            }
            if (!copied) continue;
            await query(
              `insert into images (id, width, height, bytes, crop)
               select $2, width, height, bytes, crop from images where id = $1`,
              [imgId, newImg],
            );
            copies.push(newImg);
          }
          const newId = await uniqueId(query, "cars", slugify([car.make, car.model, car.year].filter((x) => x != null && x !== "").join(" ") || "utkast"));
          await query(
            `insert into cars (id, make, model, year, title, highlight, body_type, color_name, color_hex, mileage_km,
                               fuel, gearbox, inspected, condition_summary, highlights, things_to_note, description,
                               start_price, min_increment, reserve_price, ends_at, status, images, admin_note, facts)
             select $2, make, model, year, title || ' (kopia)', highlight, body_type, color_name, color_hex, mileage_km,
                    fuel, gearbox, inspected, condition_summary, highlights, things_to_note, description,
                    start_price, min_increment, reserve_price, now() + interval '7 days', 'draft', $3::text[], admin_note, facts
               from cars where id = $1`,
            [id, newId, copies],
          );
          return json(await getCar(query, newId), 201, NO_CACHE);
        }
      }
      return json(await getCar(query, id), 200, NO_CACHE);
    }

    case "DELETE bids/:id":
      await query("delete from bids where id::text = $1", [id]);
      return json({ ok: true }, 200, NO_CACHE);

    /* ---------------- Bilder ---------------- */
    case "POST images": {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new HttpError(400, "Kunde inte läsa bilden.");
      }
      const files: Partial<Record<(typeof VARIANTS)[number], ArrayBuffer>> = {};
      for (const v of VARIANTS) {
        const f = form.get(v);
        if (!f || typeof f === "string") {
          if (v === "source") continue;
          throw new HttpError(400, "Bildfil saknas.");
        }
        if (!/^image\/(jpeg|webp|png)$/.test(f.type)) throw new HttpError(400, "Bilden måste vara JPEG, WebP eller PNG.");
        if (f.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Bilden är för stor.");
        files[v] = await f.arrayBuffer();
      }
      const width = int(form.get("width"), "bredd", 1, 10_000);
      const height = int(form.get("height"), "höjd", 1, 10_000);
      let crop: unknown = null;
      try {
        crop = JSON.parse(String(form.get("crop") ?? "null"));
      } catch {
        /* beskärningsdata är valfritt */
      }
      const imgId = randomId();
      for (const [v, data] of Object.entries(files)) await deps.blobs.set(`${imgId}/${v}`, data!);
      await query("insert into images (id, width, height, bytes, crop) values ($1, $2, $3, $4, $5::jsonb)", [
        imgId,
        width,
        height,
        files.main!.byteLength,
        JSON.stringify(crop),
      ]);
      cleanupOrphanImages(deps).catch((err) => console.error("Städning av bilder misslyckades", err));
      return json({ id: imgId, width, height, hasSource: !!files.source }, 201, NO_CACHE);
    }

    case "GET images/:id": {
      const rows = await query("select id, width, height, crop from images where id = $1", [id]);
      if (!rows[0]) throw new HttpError(404, "Bilden hittades inte.");
      return json(rows[0], 200, NO_CACHE);
    }

    /* ---------------- Inkorg ---------------- */
    case "GET messages": {
      const contact = await query(
        "select id::text, name, email, message, status, note, created_at from contact_messages order by created_at desc limit 500",
      );
      const sell = await query(
        `select id::text, make, model, year, mileage_km, description, name, phone, email, status, note, created_at
           from sell_requests order by created_at desc limit 500`,
      );
      return json({ contact, sell }, 200, NO_CACHE);
    }

    /* ---------------- Bokningar ---------------- */
    case "GET bookings":
      return json(
        await query(
          `select id, service_id, service_name, date::text as date, time, name, phone, email, reg_number, notes,
                  status, note, created_at
             from bookings where date >= current_date - 60 order by date, time`,
        ),
        200,
        NO_CACHE,
      );

    case "PATCH bookings/:id": {
      const b = await body(req);
      const sets: string[] = [];
      const params: unknown[] = [id];
      if (b.status !== undefined) {
        params.push(oneOf(b.status, "status", ["booked", "done", "cancelled", "no_show"] as const));
        sets.push(`status = $${params.length}`);
      }
      if (b.note !== undefined) {
        params.push(text(b.note, "anteckning", 2000));
        sets.push(`note = $${params.length}`);
      }
      if (sets.length === 0) throw new HttpError(400, "Inget att uppdatera.");
      const rows = await query(`update bookings set ${sets.join(", ")} where id = $1 returning id`, params).catch((err) => {
        if ((err as { code?: string })?.code === "23505")
          throw new HttpError(409, "Tiden har bokats av någon annan och kan inte återställas.");
        return dbError(err);
      });
      if (!rows[0]) throw new HttpError(404, "Bokningen hittades inte.");
      return json({ ok: true }, 200, NO_CACHE);
    }

    case "DELETE bookings/:id":
      await query("delete from bookings where id = $1", [id]);
      return json({ ok: true }, 200, NO_CACHE);

    /* ---------------- Innehåll ---------------- */
    case "GET content": {
      const [services, faqs, reviews] = await Promise.all([
        query("select * from services order by sort_order, name"),
        query("select * from faqs order by sort_order"),
        query("select * from reviews order by sort_order, created_at desc"),
      ]);
      return json({ services, faqs, reviews }, 200, NO_CACHE);
    }

    /* ---------------- Inställningar ---------------- */
    case "PUT settings": {
      const value = settingsValue(await body(req));
      // Ändras villkorens siffror får villkoren ett nytt "gäller från"-datum (sparas med varje bud).
      const prev = { ...AUCTION_DEFAULTS, ...(await query("select value from settings where key = 'site'"))[0]?.value?.auction };
      const keys = ["paymentDays", "pickupDays", "storageFee", "cancelAfterDays"] as const;
      const changed = keys.some((k) => prev[k] !== value.auction[k]);
      value.auction.updatedAt = changed ? new Date().toISOString() : prev.updatedAt;
      await query(
        `insert into settings (key, value, updated_at) values ('site', $1::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(value)],
      );
      return json(value, 200, NO_CACHE);
    }
  }

  /* Rutter med två parametrar: /messages/:kind/:id och /content/:type/:id */
  if (section === "messages" && id && sub && (method === "PATCH" || method === "DELETE")) {
    const table = id === "contact" ? "contact_messages" : id === "sell" ? "sell_requests" : null;
    if (!table) throw new HttpError(404, "Hittades inte.");
    if (method === "DELETE") {
      await query(`delete from ${table} where id::text = $1`, [sub]);
      return json({ ok: true }, 200, NO_CACHE);
    }
    const b = await body(req);
    const sets: string[] = [];
    const params: unknown[] = [sub];
    if (b.status !== undefined) {
      params.push(oneOf(b.status, "status", ["new", "read", "archived"] as const));
      sets.push(`status = $${params.length}`);
    }
    if (b.note !== undefined) {
      params.push(text(b.note, "anteckning", 2000));
      sets.push(`note = $${params.length}`);
    }
    if (sets.length === 0) throw new HttpError(400, "Inget att uppdatera.");
    await query(`update ${table} set ${sets.join(", ")} where id::text = $1`, params);
    return json({ ok: true }, 200, NO_CACHE);
  }

  if (section === "content" && id) {
    const type = oneOf(id, "typ", ["services", "faqs", "reviews"] as const);
    const itemId = parts[2] ? decodeURIComponent(parts[2]) : undefined;

    if (method === "POST" && itemId === "reorder") {
      const ids = strList((await body(req)).ids, "ordning", { maxItems: 500, max: 100 });
      await query(
        `update ${type} t set sort_order = o.ord::int
           from unnest($1::text[]) with ordinality as o(id, ord) where t.id = o.id`,
        [ids],
      );
      return json({ ok: true }, 200, NO_CACHE);
    }

    if (method === "POST" && !itemId) {
      const v = contentValues(type, await body(req));
      const cols = Object.keys(v);
      const newId =
        type === "services"
          ? await uniqueId(query, "services", `svc-${slugify(String(v.name))}`)
          : crypto.randomUUID();
      const rows = await query(
        `insert into ${type} (id, ${cols.join(", ")}, sort_order)
         values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, (select coalesce(max(sort_order), 0) + 1 from ${type}))
         returning *`,
        [newId, ...Object.values(v)],
      ).catch(dbError);
      return json(rows[0], 201, NO_CACHE);
    }

    if (method === "PUT" && itemId) {
      const v = contentValues(type, await body(req));
      const cols = Object.keys(v);
      const rows = await query(
        `update ${type} set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1 returning *`,
        [itemId, ...Object.values(v)],
      ).catch(dbError);
      if (!rows[0]) throw new HttpError(404, "Hittades inte.");
      return json(rows[0], 200, NO_CACHE);
    }

    if (method === "DELETE" && itemId) {
      await query(`delete from ${type} where id = $1`, [itemId]).catch((err) => {
        if ((err as { code?: string })?.code === "23503")
          throw new HttpError(409, "Tjänsten har bokningar kopplade till sig och kan inte tas bort.");
        dbError(err);
      });
      return json({ ok: true }, 200, NO_CACHE);
    }
  }

  throw new HttpError(404, "Hittades inte.");
}

/** Publik bildvisning: /api/images/:id/:variant (main | thumb | source). */
export async function serveImage(path: string, blobs: BlobStore): Promise<Response> {
  const [, id, variant = "main"] = path.split("/").filter(Boolean);
  const name = (id ?? "").replace(/\.jpe?g$/, "");
  if (!IMAGE_ID_RE.test(name) || !VARIANTS.includes(variant.replace(/\.jpe?g$/, "") as never))
    return json({ error: "Hittades inte." }, 404);
  const data = await blobs.get(`${name}/${variant.replace(/\.jpe?g$/, "")}`);
  if (!data) return json({ error: "Hittades inte." }, 404, NO_CACHE);
  const bytes = new Uint8Array(data);
  const type = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0x52 ? "image/webp" : "image/jpeg";
  return new Response(data, {
    headers: {
      "content-type": type,
      // Varje bild har ett unikt id (ny beskärning = nytt id), så den kan cachas för alltid.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
