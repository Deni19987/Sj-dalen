// Admin-API: /api/admin/*. Alla anrop utom inloggningen kräver en giltig token.

import {
  authEnabled,
  authenticate,
  bearer,
  checkLogin,
  createToken,
  hashPassword,
  normalizeEmail,
  ownerEmail,
  verifyPassword,
  type AuthConfig,
} from "./auth";
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
                'email', b.email, 'phone', b.phone)
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
  const startPrice = int(b.startPrice, "utropspris", 0, 100_000_000);
  return {
    make: str(b.make, "märke", { max: 60 }),
    model: str(b.model, "modell", { max: 60 }),
    year: int(b.year, "årsmodell", 1900, thisYear + 1),
    title: str(b.title, "rubrik", { max: 120 }),
    highlight: text(b.highlight, "kort säljtext", 200),
    body_type: oneOf(b.bodyType, "kaross", BODY_TYPES),
    color_name: str(b.colorName, "färg", { max: 40 }),
    color_hex: colorHex,
    mileage_km: int(b.mileageKm, "mätarställning", 0, 3_000_000),
    fuel: str(b.fuel, "bränsle", { max: 30 }),
    gearbox: str(b.gearbox, "växellåda", { max: 30 }),
    inspected: bool(b.inspected),
    condition_summary: text(b.conditionSummary, "skick", 500),
    highlights: strList(b.highlights, "höjdpunkter"),
    things_to_note: strList(b.thingsToNote, "att känna till"),
    description: text(b.description, "beskrivning", 8000),
    start_price: startPrice,
    min_increment: int(b.minIncrement, "budhöjning", 1, 1_000_000),
    reserve_price: optInt(b.reservePrice, "reservationspris", 0, 100_000_000),
    ends_at: timestamp(b.endsAt, "sluttid"),
    status,
    sold_price: status === "sold" ? int(b.soldPrice, "slutpris", 0, 100_000_000) : optInt(b.soldPrice, "slutpris", 0, 100_000_000),
    images,
    admin_note: text(b.adminNote, "intern anteckning", 2000),
  };
}

const CAR_CAST: Record<string, string> = {
  highlights: "::text[]",
  things_to_note: "::text[]",
  images: "::text[]",
  ends_at: "::timestamptz",
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
  return {
    phone: str(b.phone, "telefon", { max: 40 }),
    email: mail,
    address: str(b.address, "adress", { max: 200 }),
    hours: hours.map((h: any) => ({ label: str(h?.label, "dag", { max: 40 }), value: str(h?.value, "tid", { max: 40 }) })),
    announcement: { enabled: bool(ann.enabled), text: text(ann.text, "notis", 200), link, tone },
  };
}

function newPassword(v: unknown) {
  if (typeof v !== "string" || v.length < 8) throw new HttpError(400, "Lösenordet måste vara minst 8 tecken.");
  if (v.length > 200) throw new HttpError(400, "Lösenordet är för långt.");
  return v;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export async function handleAdmin(req: Request, path: string, deps: AdminDeps): Promise<Response> {
  const { query } = deps;
  const method = req.method;
  const parts = path.split("/").filter(Boolean).slice(1); // efter "admin"
  const [section, id, sub] = parts.map(decodeURIComponent);

  if (section === "login" && method === "POST") {
    if (!authEnabled(deps.auth))
      throw new HttpError(503, "Admin är inte aktiverat. Lägg in ADMIN_EMAIL och ADMIN_PASSWORD i Netlify.");
    const b = await body(req);
    const result =
      typeof b.email === "string" && typeof b.password === "string" && b.password.length <= 200
        ? await checkLogin(deps.auth, query, b.email, b.password)
        : null;
    if (!result) {
      await new Promise((r) => setTimeout(r, 600)); // bromsar gissningsförsök
      throw new HttpError(401, "Fel e-post eller lösenord.");
    }
    return json(await createToken(deps.auth, result.identity, result.fingerprint, b.remember ? 30 * DAY : DAY), 200, NO_CACHE);
  }

  const me = await authenticate(deps.auth, query, bearer(req));
  if (!me) throw new HttpError(401, "Du är utloggad. Logga in igen.");

  const route = `${method} ${section}${id ? "/:id" : ""}${sub ? `/${sub}` : ""}`;

  switch (route) {
    case "GET session":
      return json(me, 200, NO_CACHE);

    /* ---------------- Användare ---------------- */
    case "GET users": {
      const rows = await query("select id::text, email, name, created_at, last_login_at from admin_users order by created_at");
      const owner = deps.auth.password
        ? [{ id: "owner", email: ownerEmail(deps.auth), name: "Huvudkonto", owner: true, created_at: null, last_login_at: null }]
        : [];
      return json([...owner, ...rows.map((r) => ({ ...r, owner: false }))], 200, NO_CACHE);
    }

    case "POST users": {
      const b = await body(req);
      const mail = normalizeEmail(str(b.email, "e-post", { max: 254 })!);
      if (!EMAIL_RE.test(mail)) throw new HttpError(400, "Ogiltig e-postadress.");
      if (mail === ownerEmail(deps.auth)) throw new HttpError(409, "E-postadressen används redan av huvudkontot.");
      const password = newPassword(b.password);
      const rows = await query(
        "insert into admin_users (email, name, password_hash) values ($1, $2, $3) returning id::text, email, name, created_at, last_login_at",
        [mail, text(b.name, "namn", 80), await hashPassword(password)],
      ).catch((err) => {
        if ((err as { code?: string })?.code === "23505") throw new HttpError(409, "Det finns redan ett konto med den e-postadressen.");
        return dbError(err);
      });
      return json({ ...rows[0], owner: false }, 201, NO_CACHE);
    }

    case "DELETE users/:id": {
      if (id === "owner") throw new HttpError(400, "Huvudkontot styrs av ADMIN_EMAIL och ADMIN_PASSWORD i Netlify.");
      if (id === me.id) throw new HttpError(400, "Du kan inte ta bort ditt eget konto.");
      await query("delete from admin_users where id::text = $1", [id]);
      return json({ ok: true }, 200, NO_CACHE);
    }

    case "POST password": {
      if (me.owner) throw new HttpError(400, "Huvudkontots lösenord ändras med ADMIN_PASSWORD i Netlify.");
      const b = await body(req);
      const rows = await query("select password_hash from admin_users where id::text = $1", [me.id]);
      if (!rows[0] || typeof b.current !== "string" || !(await verifyPassword(b.current, rows[0].password_hash)))
        throw new HttpError(400, "Nuvarande lösenord stämmer inte.");
      await query("update admin_users set password_hash = $2 where id::text = $1", [me.id, await hashPassword(newPassword(b.next))]);
      return json({ ok: true }, 200, NO_CACHE);
    }

    /* ---------------- Översikt ---------------- */
    case "GET overview": {
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
          (select count(*)::int from contact_messages where status = 'new') +
          (select count(*)::int from sell_requests where status = 'new') as new_messages,
          (select count(*)::int from bookings where date = current_date and status = 'booked') as bookings_today,
          (select count(*)::int from bookings where date >= current_date and status = 'booked') as bookings_upcoming`);

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
        (select 'message', id::text, name, left(message, 120), null, null, created_at
           from contact_messages order by created_at desc limit 8)
        union all
        (select 'sell', id::text, name, make || ' ' || model || ' ' || year, null, null, created_at
           from sell_requests order by created_at desc limit 8)
        union all
        (select 'booking', id, name, service_name || ' · ' || date::text || ' ' || time, null, null, created_at
           from bookings order by created_at desc limit 8)
        order by created_at desc limit 16`);

      return json({ stats, bidsPerDay, activity }, 200, NO_CACHE);
    }

    /* ---------------- Bilar ---------------- */
    case "GET cars":
      return json(await query(`${CAR_SELECT} order by c.created_at desc`), 200, NO_CACHE);

    case "GET cars/:id":
      return json(await getCar(query, id), 200, NO_CACHE);

    case "POST cars": {
      const v = carValues(await body(req));
      const newId = await uniqueId(query, "cars", slugify(`${v.make} ${v.model} ${v.year}`));
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
      const action = oneOf(b.action, "åtgärd", ["end", "extend", "sell", "relist", "publish", "unpublish", "duplicate"] as const);
      switch (action) {
        case "end":
          await query("update cars set ends_at = now(), updated_at = now() where id = $1", [id]);
          break;
        case "extend":
          await query(
            "update cars set ends_at = greatest(ends_at, now()) + make_interval(hours => $2), updated_at = now() where id = $1",
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
          if (bool(b.clearBids)) await query("delete from bids where car_id = $1", [id]);
          await query(
            `update cars set status = 'active', sold_price = null, sold_at = null, extended = false,
                    ends_at = now() + make_interval(days => $2), updated_at = now() where id = $1`,
            [id, int(b.days, "dagar", 1, 60)],
          );
          break;
        case "publish":
          if (new Date(car.ends_at).getTime() <= Date.now())
            throw new HttpError(400, "Sluttiden har redan passerat. Välj en ny sluttid innan du publicerar.");
          await query("update cars set status = 'active', updated_at = now() where id = $1", [id]);
          break;
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
          const newId = await uniqueId(query, "cars", slugify(`${car.make} ${car.model} ${car.year}`));
          await query(
            `insert into cars (id, make, model, year, title, highlight, body_type, color_name, color_hex, mileage_km,
                               fuel, gearbox, inspected, condition_summary, highlights, things_to_note, description,
                               start_price, min_increment, reserve_price, ends_at, status, images, admin_note)
             select $2, make, model, year, title || ' (kopia)', highlight, body_type, color_name, color_hex, mileage_km,
                    fuel, gearbox, inspected, condition_summary, highlights, things_to_note, description,
                    start_price, min_increment, reserve_price, now() + interval '7 days', 'draft', $3::text[], admin_note
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
