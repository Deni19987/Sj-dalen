// API för Sjödalen Bilar. Körs som Netlify Function (netlify/functions/api.mts)
// och pratar med Neon Postgres. Webbläsaren når aldrig databasen direkt.

import { ensureSchema, handleAdmin, serveImage } from "./admin";
import type { AuthConfig } from "./auth";
import { termsEffectiveDate } from "../src/lib/auction";
import { sendPush } from "./push";
import {
  body,
  dbError,
  email,
  HttpError,
  int,
  isoDate,
  json,
  NO_CACHE,
  SHORT_CACHE,
  str,
  type BlobStore,
  type Query,
} from "./http";

export type { BlobStore, Query } from "./http";

export interface HandlerOptions {
  blobs: BlobStore;
  auth: AuthConfig;
  env: Record<string, string | undefined>;
}

const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;
const short = (s: string, max = 120) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
// "fre 17 okt kl. 09:00"
function bookingTime(date: string, time: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day.replace(/\./g, "")} kl. ${time}`;
}

export function createHandler(query: Query, options: HandlerOptions) {
  const push = (...args: Parameters<typeof sendPush> extends [unknown, unknown, ...infer R] ? R : never) =>
    sendPush(query, options.env, ...args);

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    const route = `${req.method} ${path}`;

    try {
      if (path === "/admin" || path.startsWith("/admin/"))
        return await handleAdmin(req, path, { query, blobs: options.blobs, auth: options.auth, env: options.env });
      if (req.method === "GET" && path.startsWith("/images/")) return await serveImage(path, options.blobs);

      switch (route) {
        case "GET /services":
          return json(await query("select * from services order by sort_order"), 200, SHORT_CACHE);

        case "GET /reviews":
          return json(await query("select * from reviews order by sort_order"), 200, SHORT_CACHE);

        case "GET /faqs":
          return json(await query("select * from faqs order by sort_order"), 200, SHORT_CACHE);

        case "GET /settings": {
          const rows = await query("select value from settings where key = 'site'");
          return json(rows[0]?.value ?? {}, 200, SHORT_CACHE);
        }

        case "GET /cars":
          await ensureSchema(query);
          return json(
            await query(`
              select c.id, c.make, c.model, c.year, c.title, c.highlight, c.body_type, c.color_name, c.color_hex,
                c.mileage_km, c.fuel, c.gearbox, c.inspected, c.condition_summary, c.highlights, c.things_to_note,
                c.description, c.start_price, c.min_increment, c.ends_at, c.status, c.sold_price, c.extended,
                c.images, c.created_at, coalesce(c.facts->'equipment', '[]'::jsonb) as equipment,
                c.facts->>'engine' as engine, c.facts->>'horsepower' as horsepower, c.facts->>'drive' as drive, c.facts->>'trim' as trim,
                (c.reserve_price is null or coalesce((select max(amount) from bids b where b.car_id = c.id), 0) >= c.reserve_price)
                  as reserve_met,
                (c.reserve_price is not null) as has_reserve,
                coalesce(
                  (select json_agg(json_build_object('id', b.id, 'name', b.name, 'amount', b.amount, 'created_at', b.created_at)
                           order by b.created_at)
                     from bids b where b.car_id = c.id),
                  '[]'::json) as bids
              from cars c
              where c.status <> 'draft'
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
          if (b.acceptTerms !== true)
            throw new HttpError(400, "Du behöver godkänna auktionsvillkoren för att lägga bud.");
          await ensureSchema(query);
          const rows = await query("select place_bid($1, $2, $3, $4, $5) as result", [
            str(b.carId, "bil", { max: 100 }),
            str(b.name, "namn", { max: 80 }),
            int(b.amount, "belopp", 1, 100_000_000),
            email(b.email),
            str(b.phone, "telefon", { min: 6, max: 40 }),
          ]);
          const result = rows[0].result;
          // Vilken version av villkoren budgivaren godkände. Bud på samma bil har alltid olika belopp.
          if (result?.ok) {
            const settings = await query("select value from settings where key = 'site'");
            await query("update bids set terms_version = $3 where car_id = $1 and amount = $2", [
              b.carId,
              b.amount,
              termsEffectiveDate(settings[0]?.value?.auction),
            ]);
            const car = (await query("select title from cars where id = $1", [b.carId]))[0];
            await push("bids", {
              title: `Nytt bud: ${kr(b.amount)}`,
              body: `${car?.title ?? "Bil"} – ${short(String(b.name), 60)}${result.extended ? " (auktionen förlängd)" : ""}`,
              url: `/admin/bud?bil=${encodeURIComponent(b.carId)}`,
              tag: `bid-${b.carId}`,
            });
          }
          return json(result);
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
          const service = (await query("select name from services where id = $1", [b.serviceId]))[0];
          await push("bookings", {
            title: `Ny bokning: ${service?.name ?? "verkstadstid"}`,
            body: `${bookingTime(b.date, b.time)} – ${short(String(b.name), 60)}${b.regNumber ? `, ${String(b.regNumber).toUpperCase()}` : ""}`,
            url: "/admin/bokningar",
            tag: `booking-${rows[0].result?.id ?? Date.now()}`,
          });
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
          await push("messages", {
            title: "Någon vill sälja sin bil",
            body: `${b.make} ${b.model} ${b.year}, ${Number(b.mileageKm).toLocaleString("sv-SE")} mil – ${short(String(b.name), 60)}`,
            url: "/admin/inkorg",
            tag: `sell-${Date.now()}`,
          });
          return json({ ok: true }, 201);
        }

        case "POST /contact": {
          const b = await body(req);
          await query("insert into contact_messages (name, email, message) values ($1, $2, $3)", [
            str(b.name, "namn", { min: 2, max: 120 }),
            email(b.email),
            str(b.message, "meddelande", { min: 4, max: 5000 }),
          ]);
          await push("messages", {
            title: `Meddelande från ${short(String(b.name).trim(), 60)}`,
            body: short(String(b.message).trim().replace(/\s+/g, " ")),
            url: "/admin/inkorg",
            tag: `contact-${Date.now()}`,
          });
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
