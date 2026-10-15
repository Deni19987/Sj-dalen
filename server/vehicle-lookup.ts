// Hämta fordonsuppgifter från Transportstyrelsen – samma flöde som i Carflow.
//
// Transportstyrelsen har inget öppet API. I stället beställer man ett registerutdrag på
// https://fordon-fu-regnr.transportstyrelsen.se/ (med BankID) och anger en gemensam
// inkorg som mottagare. Här läser vi den inkorgen via Gmail-API:t och tolkar mejlet.
//
// Bara uppgifter om fordonet returneras – ägarens namn, adress och personnummer
// läses aldrig ut.
//
// Miljövariabler (samma som i Carflow, kan återanvändas):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN   – OAuth (rekommenderas)
//   GMAIL_ACCESS_TOKEN                                         – alternativ, gäller ~1 timme
//   VEHICLE_LOOKUP_INBOX                                       – visas i admin som mottagaradress

import { HttpError } from "./http";

export type Env = Record<string, string | undefined>;

export interface VehicleData {
  regNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  fuel: string | null;
  gearbox: string | null;
  bodyType: string | null;
  vehicleStatus: string | null;
  owners: number | null;
  firstRegistered: string | null;
  lastInspection: string | null;
  nextInspection: string | null;
  mileageKm: number | null;
  horsepower: number | null;
  emailReceivedAt: string | null;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const SENDER = "fordonsuppgifter@transportstyrelsen.se";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/** Miljövariabel utan mellanslag, radbrytningar och citattecken som ofta följer med när man kopierar. */
const envValue = (env: Env, key: string) => env[key]?.trim().replace(/^["']|["']$/g, "").trim() || undefined;

/** Googles felkod → förklaring på svenska. */
function tokenErrorMessage(status: number, body: string): string {
  let code = "";
  try {
    code = (JSON.parse(body) as { error?: string }).error ?? "";
  } catch {
    /* inget JSON-svar */
  }
  const base = "Kunde inte logga in i Gmail-inkorgen för registerutdrag";
  switch (code) {
    case "invalid_grant":
      return `${base}: Google säger att GMAIL_REFRESH_TOKEN är ogiltig eller har gått ut (invalid_grant). Skapa en ny refresh token och lägg in den i Netlify. Om Google-appen står i läget "Testing" går token ut efter 7 dagar – sätt den till "In production".`;
    case "invalid_client":
      return `${base}: Google känner inte igen GMAIL_CLIENT_ID eller GMAIL_CLIENT_SECRET (invalid_client). Kontrollera att båda är kopierade exakt och hör till samma Google-projekt.`;
    case "unauthorized_client":
      return `${base}: refresh token är skapad med ett annat klient-ID än GMAIL_CLIENT_ID (unauthorized_client). Skapa en ny refresh token med samma klient-ID och hemlighet som ligger i Netlify.`;
    default:
      return `${base} (Google svarade ${status}${code ? ` ${code}` : ""}). Kontrollera GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET och GMAIL_REFRESH_TOKEN i Netlify.`;
  }
}

async function accessToken(env: Env): Promise<string> {
  const direct = envValue(env, "GMAIL_ACCESS_TOKEN");
  if (direct) return direct;
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;
  const GMAIL_CLIENT_ID = envValue(env, "GMAIL_CLIENT_ID");
  const GMAIL_CLIENT_SECRET = envValue(env, "GMAIL_CLIENT_SECRET");
  const GMAIL_REFRESH_TOKEN = envValue(env, "GMAIL_REFRESH_TOKEN");
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN)
    throw new HttpError(503, "Hämtning från Transportstyrelsen är inte aktiverad. Lägg in GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET och GMAIL_REFRESH_TOKEN i Netlify (samma som i Carflow).");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Gmail token", res.status, text);
    throw new HttpError(502, tokenErrorMessage(res.status, text));
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = j.access_token;
  tokenExpiresAt = Date.now() + j.expires_in * 1000;
  return cachedToken;
}

async function gmail(env: Env, path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { authorization: `Bearer ${await accessToken(env)}` } });
  if (!res.ok) {
    console.error("Gmail", path, res.status, await res.text().catch(() => ""));
    if (res.status === 401 && envValue(env, "GMAIL_ACCESS_TOKEN"))
      throw new HttpError(502, "GMAIL_ACCESS_TOKEN i Netlify har gått ut (den gäller bara en timme). Ta bort den – då används GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET och GMAIL_REFRESH_TOKEN i stället.");
    if (res.status === 403)
      throw new HttpError(502, "Google nekar läsning av inkorgen (403). Kontrollera att Gmail API är aktiverat i Google-projektet och att refresh token har behörighet att läsa mejl (gmail.readonly).");
    // Ett misslyckat anrop får aldrig se ut som "mejlet har inte kommit än".
    throw new HttpError(502, `Kunde inte läsa inkorgen för registerutdrag (Google svarade ${res.status}). Kontrollera Gmail-anslutningen.`);
  }
  return res.json() as Promise<any>;
}

/* ------------------------------------------------------------------ */
/* Tolkning av registerutdraget                                         */
/* ------------------------------------------------------------------ */

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Alla rubriker som kan förekomma i mejlet. De fungerar också som stopp för föregående fält.
const LABELS = [
  "Registreringsnummer",
  "Fabrikat",
  "Handelsbeteckning",
  "Fordonsslag",
  "Fordonsslagsklass",
  "Färg",
  "Kaross",
  "Fordonsår",
  "Modellår",
  "Drivmedel",
  "Bränsle",
  "Växellåda",
  "Motoreffekt",
  "Effekt",
  "Datum för första registrering",
  "I trafik första gången",
  "Fordonsstatus",
  "Antal ägare sedan fordonet togs i trafik första gången",
  "Antal ägare",
  "Ägare och brukare",
  "Ägare",
  "Adress",
  "Postnummer",
  "Postort",
  "Senast godkända besiktning",
  "Nästa besiktning senast",
  "Noterad mätarställning",
  "Personnummer",
  "Organisationsnummer",
  "Föregående ägare",
];
const STOPS = LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

function field(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`${escaped}\\s*[\\n:]+\\s*([\\s\\S]*?)(?=\\n\\s*(?:${STOPS})\\s*[\\n:]|$)`, "i"));
  if (!m) return null;
  const value = m[1].replace(/\s+/g, " ").trim().replace(/\s*uppgift saknas\.?\s*$/i, "").trim();
  return value || null;
}

const date = (s: string | null) => s?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
const firstInt = (s: string | null) => {
  const m = s?.replace(/\s/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
const capitalize = (s: string | null) =>
  s ? s.charAt(0).toLocaleUpperCase("sv-SE") + s.slice(1).toLocaleLowerCase("sv-SE") : null;

/** Mätarställningen anges ibland i mil – vi sparar alltid km. */
function mileageKm(s: string | null): number | null {
  const n = firstInt(s);
  if (n == null) return null;
  return /\bmil\b/i.test(s ?? "") ? n * 10 : n;
}

function parse(text: string, reg: string): Omit<VehicleData, "emailReceivedAt"> {
  const year = firstInt(field(text, "Modellår")) ?? firstInt(field(text, "Fordonsår"));
  return {
    regNumber: field(text, "Registreringsnummer")?.toUpperCase().replace(/\s/g, "") ?? reg,
    make: capitalize(field(text, "Fabrikat")),
    model: field(text, "Handelsbeteckning"),
    year: year && year > 1900 && year < 2100 ? year : null,
    color: capitalize(field(text, "Färg")),
    fuel: capitalize(field(text, "Drivmedel") ?? field(text, "Bränsle")),
    gearbox: field(text, "Växellåda"),
    bodyType: field(text, "Kaross"),
    vehicleStatus: field(text, "Fordonsstatus")?.split("(")[0].trim() || null,
    owners: firstInt(field(text, "Antal ägare sedan fordonet togs i trafik första gången") ?? field(text, "Antal ägare")),
    firstRegistered: date(field(text, "Datum för första registrering") ?? field(text, "I trafik första gången")),
    lastInspection: date(field(text, "Senast godkända besiktning")),
    nextInspection: date(field(text, "Nästa besiktning senast")),
    mileageKm: mileageKm(field(text, "Noterad mätarställning")),
    horsepower: firstInt(field(text, "Motoreffekt") ?? field(text, "Effekt")),
  };
}

function decode(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function bodyText(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  if (part.mimeType === "text/html" && part.body?.data) return htmlToText(decode(part.body.data));
  if (part.parts) {
    const plain = part.parts.find((p: any) => p.mimeType === "text/plain" && p.body?.data);
    if (plain) return decode(plain.body.data);
    const html = part.parts.find((p: any) => p.mimeType === "text/html" && p.body?.data);
    if (html) return htmlToText(decode(html.body.data));
    for (const p of part.parts) {
      const t = bodyText(p);
      if (t) return t;
    }
  }
  return "";
}

/** O och 0 (och I och 1) ser likadana ut i registreringsnummer – jämför dem som samma tecken. */
const canonical = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/I/g, "1");

export async function lookupVehicle(env: Env, rawReg: string): Promise<VehicleData> {
  const reg = rawReg.toUpperCase().replace(/[^A-Z0-9ÅÄÖ]/g, "");
  if (reg.length < 2 || reg.length > 8) throw new HttpError(400, "Ange ett giltigt registreringsnummer.");
  const target = canonical(reg);

  const list = await gmail(env, `/messages?q=${encodeURIComponent(`from:${SENDER}`)}&maxResults=60&includeSpamTrash=true`);
  const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
  if (ids.length === 0)
    throw new HttpError(404, "Inga registerutdrag har kommit till inkorgen ännu. Beställ ett och försök igen om någon minut.");

  // Nyaste först, några åt gången så att vi hinner inom funktionens tidsgräns.
  for (let i = 0; i < ids.length; i += 8) {
    const batch = await Promise.all(ids.slice(i, i + 8).map((id) => gmail(env, `/messages/${id}?format=full`).catch(() => null)));
    for (const msg of batch) {
      if (!msg) continue;
      const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
      const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
      const text = bodyText(msg.payload);
      if (!canonical(`${subject} ${msg.snippet ?? ""} ${text}`).includes(target)) continue;
      return { ...parse(text, reg), emailReceivedAt: new Date(Number(msg.internalDate)).toISOString() };
    }
  }
  throw new HttpError(404, `Registerutdraget för ${reg} har inte kommit in än. Vänta någon minut och försök igen.`);
}
