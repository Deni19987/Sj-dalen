// Allt som händer runt en auktion utan att någon i personalen trycker på något:
// notiser till personalen, mejl till budgivarna och påminnelser efter avslutad auktion.
//
// onBidPlaced körs direkt när ett bud läggs. runAuctionChecks körs var 5:e minut
// (netlify/functions/auction-checks.mts) och kan köras för hand via POST /api/admin/checks.

import { runStatements, type Query } from "./http";
import { sendMail } from "./mail";
import { sendPush } from "./push";
import { AUCTION_DEFAULTS } from "../src/lib/auction";

type Env = Record<string, string | undefined>;

const kr = (n: number) => `${Number(n).toLocaleString("sv-SE")} kr`;
const firstName = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";

export const AUCTION_FLOW_SCHEMA = `
alter table public.cars add column if not exists deal                jsonb not null default '{}';
alter table public.cars add column if not exists notified_ending_at  timestamptz;
alter table public.cars add column if not exists notified_ended_at   timestamptz;
alter table public.cars add column if not exists reminded_payment_at timestamptz;
alter table public.cars add column if not exists reminded_pickup_at  timestamptz;
alter table public.bids add column if not exists outbid_mailed_at    timestamptz;
`;

let ready: Promise<unknown> | null = null;
export function ensureAuctionFlowSchema(query: Query) {
  ready ??= runStatements(query, AUCTION_FLOW_SCHEMA).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function site(query: Query) {
  return (await query("select value from settings where key = 'site'"))[0]?.value ?? {};
}
const company = (s: any) => String(s?.company?.name || "").trim() || "Sjödalen Bilar AB";
const terms = (s: any) => ({ ...AUCTION_DEFAULTS, ...(s?.auction ?? {}) });

/** Lägg till n arbetsdagar (mån–fre) på ett datum. */
export function addBusinessDays(from: Date, n: number) {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* När ett bud läggs                                                    */
/* ------------------------------------------------------------------ */

export interface PreviousTop {
  id: string;
  name: string;
  email: string | null;
  amount: number;
}

/** Högsta budet innan det nya läggs – behövs för "du har blivit överbjuden" och reservationspriset. */
export async function topBid(query: Query, carId: string): Promise<PreviousTop | null> {
  return ((await query("select id::text, name, email, amount from bids where car_id = $1 order by amount desc limit 1", [carId]))[0] as PreviousTop) ?? null;
}

export async function onBidPlaced(
  query: Query,
  env: Env,
  origin: string,
  bid: { carId: string; amount: number; name: string; email: string; extended: boolean },
  prev: PreviousTop | null,
) {
  await ensureAuctionFlowSchema(query);
  const car = (await query("select id, title, reserve_price from cars where id = $1", [bid.carId]))[0];
  if (!car) return;
  const s = await site(query);

  await sendPush(query, env, "bids", {
    title: `Nytt bud: ${kr(bid.amount)}`,
    body: `${car.title} – ${bid.name}${bid.extended ? " (auktionen förlängd)" : ""}`,
    url: `/admin/bud?bil=${encodeURIComponent(car.id)}`,
    tag: `bid-${car.id}`,
  });

  if (car.reserve_price != null && bid.amount >= car.reserve_price && (!prev || prev.amount < car.reserve_price))
    await sendPush(query, env, "reserve", {
      title: "Reservationspriset är uppnått",
      body: `${car.title} – ${kr(bid.amount)} av ${bid.name}`,
      url: `/admin/bilar/${encodeURIComponent(car.id)}`,
      tag: `reserve-${car.id}`,
    });

  // Den som ledde förut får veta att hen blivit överbjuden (inte om man bjuder över sig själv).
  if (prev?.email && prev.email.toLowerCase() !== bid.email.toLowerCase()) {
    const r = await sendMail(query, env, {
      to: prev.email,
      fromName: company(s),
      subject: `Du har blivit överbjuden på ${car.title}`,
      heading: "Du har blivit överbjuden",
      paragraphs: [
        `Hej ${firstName(prev.name)}!`.replace("Hej !", "Hej!"),
        `Någon har lagt ett högre bud på ${car.title}. Nytt högsta bud är ${kr(bid.amount)} (ditt bud var ${kr(prev.amount)}).`,
        "Vill du fortfarande ha bilen kan du lägga ett nytt bud innan auktionen tar slut.",
      ],
      button: { label: "Lägg ett nytt bud", url: `${origin}/auktion/${encodeURIComponent(car.id)}` },
      footer: `Du får det här mejlet för att du lagt bud hos ${company(s)}.`,
    });
    if (r.ok) await query("update bids set outbid_mailed_at = now() where id::text = $1", [prev.id]);
  }
}

/* ------------------------------------------------------------------ */
/* Schemalagd kontroll                                                  */
/* ------------------------------------------------------------------ */

export async function runAuctionChecks(query: Query, env: Env, origin: string) {
  await ensureAuctionFlowSchema(query);
  const s = await site(query);
  const t = terms(s);
  const done: string[] = [];

  // 1. Slutar inom en timme
  const ending = await query(`
    update cars c set notified_ending_at = now()
     where c.status = 'active' and c.notified_ending_at is null
       and c.ends_at > now() and c.ends_at <= now() + interval '1 hour'
    returning c.id, c.title, c.ends_at,
      (select max(amount) from bids b where b.car_id = c.id) as top,
      (select count(*)::int from bids b where b.car_id = c.id) as n`);
  for (const c of ending) {
    await sendPush(query, env, "ending", {
      title: "Slutar inom en timme",
      body: `${c.title} – ${c.n ? `${kr(c.top)}, ${c.n} bud` : "inga bud än"}`,
      url: `/admin/bilar/${encodeURIComponent(c.id)}`,
      tag: `ending-${c.id}`,
    });
    done.push(`ending:${c.id}`);
  }

  // 2. Avslutade auktioner
  const ended = await query(`
    update cars c set notified_ended_at = now(),
           deal = jsonb_set(coalesce(c.deal, '{}'), '{endedAt}', to_jsonb(now()))
     where c.status = 'active' and c.notified_ended_at is null and c.ends_at <= now()
    returning c.id, c.title, c.reserve_price`);
  for (const c of ended) {
    const top = await topBid(query, c.id);
    const url = `/admin/bilar/${encodeURIComponent(c.id)}`;
    if (!top) {
      await sendPush(query, env, "ended", { title: "Auktionen slutade utan bud", body: `${c.title} – lägg ut igen eller sänk utropspriset`, url, tag: `ended-${c.id}` });
    } else if (c.reserve_price != null && top.amount < c.reserve_price) {
      await sendPush(query, env, "ended", {
        title: "Under reservationspriset",
        body: `${c.title} – högsta bud ${kr(top.amount)} av ${top.name}. Godta inom två arbetsdagar eller lägg ut igen.`,
        url,
        tag: `ended-${c.id}`,
      });
      if (top.email)
        await sendMail(query, env, {
          to: top.email,
          fromName: company(s),
          subject: `Auktionen på ${c.title} är avslutad`,
          heading: "Auktionen är avslutad",
          paragraphs: [
            `Hej ${firstName(top.name)}!`.replace("Hej !", "Hej!"),
            `Du hade högst bud på ${c.title} (${kr(top.amount)}), men reservationspriset nåddes inte.`,
            "Ditt bud gäller i två arbetsdagar. Vi hör av oss om vi kan godta det – annars behöver du inte göra något.",
          ],
          button: { label: "Se bilen", url: `${origin}/auktion/${encodeURIComponent(c.id)}` },
          footer: `Enligt auktionsvillkoren hos ${company(s)}: ${origin}/auktion/villkor`,
        });
    } else {
      await sendPush(query, env, "ended", {
        title: `Vinnare: ${top.name}, ${kr(top.amount)}`,
        body: `${c.title} – kontakta vinnaren med betalningsuppgifter`,
        url,
        tag: `ended-${c.id}`,
      });
      if (top.email)
        await sendMail(query, env, {
          to: top.email,
          fromName: company(s),
          subject: `Du har högst bud på ${c.title}!`,
          heading: "Grattis – du har högst bud!",
          paragraphs: [
            `Hej ${firstName(top.name)}!`.replace("Hej !", "Hej!"),
            `Auktionen på ${c.title} är avslutad och ditt bud på ${kr(top.amount)} är högst.`,
            `Vi hör av oss senast nästa vardag med betalningsuppgifter. Betalningen ska vara oss tillhanda inom ${t.paymentDays} bankdagar, och bilen hämtas hos oss inom ${t.pickupDays} dagar efter betalningen.`,
            "Har du frågor kan du svara i chatten på bilens sida.",
          ],
          button: { label: "Se bilen", url: `${origin}/auktion/${encodeURIComponent(c.id)}` },
          footer: `Köpet följer auktionsvillkoren hos ${company(s)}: ${origin}/auktion/villkor`,
        });
    }
    done.push(`ended:${c.id}`);
  }

  // 3. Påminnelser efter auktionen: betalning och hämtning
  const open = await query(`
    select id, title, deal from cars
     where (status = 'sold' or (status = 'active' and ends_at <= now()))
       and (deal ? 'contactedAt' or deal ? 'paidAt') and not (deal ? 'pickedUpAt')
       and (reminded_payment_at is null or reminded_pickup_at is null)`);
  for (const c of open) {
    const deal = c.deal ?? {};
    const url = `/admin/bilar/${encodeURIComponent(c.id)}`;
    if (!deal.paidAt && deal.contactedAt && addBusinessDays(new Date(deal.contactedAt), t.paymentDays) < new Date()) {
      const r = await query("update cars set reminded_payment_at = now() where id = $1 and reminded_payment_at is null returning id", [c.id]);
      if (r.length) {
        await sendPush(query, env, "followup", { title: "Betalningen har inte kommit in", body: `${c.title} – ${t.paymentDays} bankdagar har gått`, url, tag: `pay-${c.id}` });
        done.push(`payment:${c.id}`);
      }
    }
    if (deal.paidAt && !deal.pickedUpAt && new Date(deal.paidAt).getTime() + t.pickupDays * 86_400_000 < Date.now()) {
      const r = await query("update cars set reminded_pickup_at = now() where id = $1 and reminded_pickup_at is null returning id", [c.id]);
      if (r.length) {
        await sendPush(query, env, "followup", {
          title: "Bilen är inte hämtad",
          body: `${c.title} – ${t.pickupDays} dagar sedan betalningen${t.storageFee ? `, förvaringsavgift ${t.storageFee} kr/dygn gäller` : ""}`,
          url,
          tag: `pickup-${c.id}`,
        });
        done.push(`pickup:${c.id}`);
      }
    }
  }
  return done;
}
