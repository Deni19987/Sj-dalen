// API för Sjödalen Bilar. Körs som Netlify Function (netlify/functions/api.mts)
// och pratar med Neon Postgres. Webbläsaren når aldrig databasen direkt.

/** Kör en parametriserad SQL-fråga och returnerar raderna. */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

// Publikt innehåll får cachas kort i CDN:et; auktionsdata ska vara färsk.
const SHORT_CACHE = { "cache-control": "public, max-age=0, s-maxage=60" };
const NO_CACHE = { "cache-control": "no-store" };

async function body(req: Request): Promise<Record<string, any>> {
  try {
    const data = await req.json();
    if (data && typeof data === "object") return data;
  } catch {
    /* faller igenom */
  }
  throw new HttpError(400, "Ogiltig förfrågan.");
}

function str(v: unknown, field: string, { min = 1, max = 200, optional = false } = {}) {
  if (v == null || v === "") {
    if (optional) return null;
    throw new HttpError(400, `Fältet ${field} saknas.`);
  }
  if (typeof v !== "string") throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  return s;
}

function int(v: unknown, field: string, min: number, max: number) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  return n;
}

function email(v: unknown) {
  const s = str(v, "e-post", { max: 254 })!;
  if (!EMAIL_RE.test(s)) throw new HttpError(400, "Ogiltig e-postadress.");
  return s;
}

function isoDate(v: unknown) {
  if (typeof v !== "string" || !DATE_RE.test(v)) throw new HttpError(400, "Ogiltigt datum.");
  return v;
}

/** Skriver om Postgres-fel som funktionerna kastar (raise exception) till 400 med text. */
function dbError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  if (e?.code === "P0001" && e.message) throw new HttpError(400, e.message);
  if (e?.code === "23514") throw new HttpError(400, "Ogiltiga uppgifter.");
  throw err;
}

export function createHandler(query: Query) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    const route = `${req.method} ${path}`;

    try {
      switch (route) {
        case "GET /services":
          return json(await query("select * from services order by sort_order"), 200, SHORT_CACHE);

        case "GET /reviews":
          return json(await query("select * from reviews order by sort_order"), 200, SHORT_CACHE);

        case "GET /faqs":
          return json(await query("select * from faqs order by sort_order"), 200, SHORT_CACHE);

        case "GET /cars":
          return json(
            await query(`
              select c.*,
                coalesce(
                  (select json_agg(json_build_object('id', b.id, 'name', b.name, 'amount', b.amount, 'created_at', b.created_at)
                           order by b.created_at)
                     from bids b where b.car_id = c.id),
                  '[]'::json) as bids
              from cars c
              order by c.ends_at`),
            200,
            NO_CACHE,
          );

        case "GET /booked-slots": {
          const date = isoDate(url.searchParams.get("date"));
          const rows = await query("select slot from booked_slots($1::date)", [date]);
          return json(rows.map((r) => r.slot), 200, NO_CACHE);
        }

        case "POST /bids": {
          const b = await body(req);
          const rows = await query("select place_bid($1, $2, $3) as result", [
            str(b.carId, "bil", { max: 100 }),
            str(b.name, "namn", { max: 80 }),
            int(b.amount, "belopp", 1, 100_000_000),
          ]);
          return json(rows[0].result);
        }

        case "POST /bookings": {
          const b = await body(req);
          const rows = await query("select create_booking($1, $2::date, $3, $4, $5, $6, $7, $8) as result", [
            str(b.serviceId, "tjänst", { max: 100 }),
            isoDate(b.date),
            str(b.time, "tid", { max: 5 }),
            str(b.name, "namn", { min: 2, max: 120 }),
            str(b.phone, "telefon", { min: 6, max: 40 }),
            email(b.email),
            str(b.regNumber, "registreringsnummer", { max: 10, optional: true }),
            str(b.notes, "övrigt", { max: 2000, optional: true }),
          ]).catch(dbError);
          return json(rows[0].result, 201);
        }

        case "POST /sell-requests": {
          const b = await body(req);
          const thisYear = new Date().getFullYear();
          await query(
            `insert into sell_requests (make, model, year, mileage_km, description, name, phone, email)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              str(b.make, "märke", { max: 60 }),
              str(b.model, "modell", { max: 60 }),
              int(b.year, "årsmodell", 1970, thisYear + 1),
              int(b.mileageKm, "miltal", 0, 5_000_000),
              str(b.description, "beskrivning", { max: 4000, optional: true }) ?? "",
              str(b.name, "namn", { min: 2, max: 120 }),
              str(b.phone, "telefon", { min: 6, max: 40 }),
              email(b.email),
            ],
          );
          return json({ ok: true }, 201);
        }

        case "POST /contact": {
          const b = await body(req);
          await query("insert into contact_messages (name, email, message) values ($1, $2, $3)", [
            str(b.name, "namn", { min: 2, max: 120 }),
            email(b.email),
            str(b.message, "meddelande", { min: 4, max: 5000 }),
          ]);
          return json({ ok: true }, 201);
        }

        default:
          return json({ error: "Hittades inte." }, 404);
      }
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Något gick fel. Försök igen om en stund." }, 500);
    }
  };
}
