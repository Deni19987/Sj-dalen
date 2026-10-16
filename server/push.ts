// Pushnotiser till personalens mobiler (Web Push), samma upplägg som i Carflow.
//
// Varje enhet som slår på notiser i admin sparas i push_subscriptions, med vilka slags
// händelser den vill ha (bud, bokningar, meddelanden). VAPID-nycklarna skapas automatiskt
// första gången och sparas i settings-tabellen (nyckel 'vapid', lämnas aldrig ut utom den
// publika delen) – eller sätts med VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY i Netlify.

import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import type { Query } from "./handler";

export const PUSH_TOPICS = ["bids", "bookings", "messages"] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];

export type PushPayload = {
  title: string;
  body: string;
  /** Sidan i admin som öppnas när man trycker på notisen */
  url: string;
  /** Notiser med samma tag ersätter varandra */
  tag?: string;
};

interface Vapid {
  subject: string;
  publicKey: string;
  privateKey: string;
}

let tableReady: Promise<unknown> | null = null;
export function ensurePushTable(query: Query) {
  tableReady ??= query(`
    create table if not exists public.push_subscriptions (
      id          uuid primary key default gen_random_uuid(),
      endpoint    text not null unique,
      p256dh      text not null,
      auth        text not null,
      user_agent  text,
      topics      text[] not null default '{bids,bookings,messages}',
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    )`).catch((err) => {
    tableReady = null;
    throw err;
  });
  return tableReady;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function generateVapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array([4, ...fromB64url(jwk.x!), ...fromB64url(jwk.y!)]);
  return { publicKey: b64url(raw), privateKey: jwk.d! };
}

let vapidCache: Promise<Vapid> | null = null;
export function getVapid(query: Query, env: Record<string, string | undefined> = {}): Promise<Vapid> {
  vapidCache ??= (async () => {
    const site = (await query("select value from settings where key = 'site'"))[0]?.value;
    const subject = env.VAPID_SUBJECT || `mailto:${site?.email || "info@sjodalenbilar.se"}`;
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
      return { subject, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
    const stored = (await query("select value from settings where key = 'vapid'"))[0]?.value;
    if (stored?.publicKey && stored?.privateKey) return { subject, ...stored };
    // Första gången: skapa nycklar. "on conflict do nothing" + ny läsning gör att två samtidiga
    // anrop ändå får samma nycklar.
    await query(
      `insert into settings (key, value, updated_at) values ('vapid', $1::jsonb, now()) on conflict (key) do nothing`,
      [JSON.stringify(await generateVapidKeys())],
    );
    const saved = (await query("select value from settings where key = 'vapid'"))[0].value;
    return { subject, publicKey: saved.publicKey, privateKey: saved.privateKey };
  })().catch((err) => {
    vapidCache = null;
    throw err;
  });
  return vapidCache;
}

/** Skickar en notis till alla enheter som valt händelsetypen. Kastar aldrig – en notis får inte stoppa ett bud eller en bokning. */
export async function sendPush(
  query: Query,
  env: Record<string, string | undefined>,
  topic: PushTopic | { endpoint: string },
  payload: PushPayload,
) {
  const result = { sent: 0, removed: 0, errors: [] as string[] };
  try {
    await ensurePushTable(query);
    const subs =
      typeof topic === "string"
        ? await query("select id, endpoint, p256dh, auth from push_subscriptions where $1 = any(topics)", [topic])
        : await query("select id, endpoint, p256dh, auth from push_subscriptions where endpoint = $1", [topic.endpoint]);
    if (subs.length === 0) return result;
    const vapid = await getVapid(query, env);
    await Promise.all(
      subs.map(async (s) => {
        const preview = String(s.endpoint).slice(0, 60);
        try {
          const subscription: PushSubscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
          // Ingen `topic` här – Apples push-tjänst nekar topics som inte är korta base64url (BadWebPushTopic).
          const req = await buildPushPayload({ data: payload, options: { ttl: 86400, urgency: "high" } }, subscription, vapid);
          const res = await fetch(s.endpoint, {
            method: req.method.toUpperCase(),
            headers: req.headers,
            body: new Uint8Array(req.body).buffer,
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            result.sent++;
          } else if (res.status === 404 || res.status === 410) {
            // Enheten har avregistrerat sig (t.ex. appen raderad) – ta bort prenumerationen.
            await query("delete from push_subscriptions where id = $1", [s.id]);
            result.removed++;
          } else {
            result.errors.push(`${preview}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`);
          }
        } catch (err) {
          result.errors.push(`${preview}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }
  if (result.errors.length) console.error("[push]", topic, result.errors);
  return result;
}
