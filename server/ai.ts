// AI-skriven annonstext för auktionsbilar (Google Gemini – samma AI-nyckel som Carflow).
//
// Miljövariabler:
//   GEMINI_API_KEY   – krävs
//   GEMINI_MODEL     – valfri; annars "gemini-flash-latest" (Googles senaste Flash-modell) med reserver

import { HttpError } from "./http";
import { ALL_EQUIPMENT } from "../src/lib/equipment";
import type { Env } from "./vehicle-lookup";

export interface AdText {
  title: string;
  highlight: string;
  description: string;
  conditionSummary: string;
  highlights: string[];
  thingsToNote: string[];
}

const SYSTEM_PROMPT = `Du skriver bilannonser på svenska för Sjödalen Bilar AB – en bilverkstad som säljer begagnade bilar på auktion på sin egen webbplats. Bilarna har gåtts igenom i den egna verkstaden.

Du får uppgifter om en bil som JSON. Skriv en säljande men ärlig och saklig annons.

ABSOLUT VIKTIGAST – HITTA INTE PÅ:
- Påståenden om just DEN HÄR bilen (utrustning, service, skick, skador, däck, ägare, besiktning, historik) får bara bygga på uppgifterna du fått.
- Nämn aldrig utrustning som inte står i uppgifterna, även om modellen ofta har den.
- Du får använda allmän, välkänd kunskap om bilmodellen (t.ex. att modellen är känd för rymlighet, driftsäkerhet eller låg förbrukning), men formulera det som något modellen är känd för – inte som fakta om den här bilen.
- Hitta aldrig på siffror (effekt, förbrukning, pris, mätarställning, datum).
- Saknas något – skriv inget om det.

Fält att returnera:
- title: Rubrik, max 70 tecken. Märke, modell (gärna motor/utförande om det finns) och årsmodell, gärna följt av " – " och 1–2 starka säljargument från uppgifterna. Exempel: "Volvo V70 D4 Momentum 2014 – Dragkrok & full servicehistorik".
- highlight: Kort säljtext för bilkortet, en mening, max 180 tecken.
- description: Huvudtexten, 2–4 korta stycken separerade med en tom rad. Inled med vad bilen är och vem den passar. Ta med skick, historik och de mest attraktiva utrustningsdetaljerna från uppgifterna (hela utrustningslistan visas separat i annonsen, så räkna inte upp allt). Avsluta med en mening om att bilen är genomgången i vår verkstad och säljs på auktion (bara om "verkstadsbesiktigad" är sann, annars att den säljs på auktion). Ingen markdown, inga emojis, inga rubriker, inga punktlistor, inga priser.
- conditionSummary: Skicket i en kort mening, max 120 tecken.
- highlights: 3–6 korta punkter (max 60 tecken var) med de främsta fördelarna – bara från uppgifterna.
- thingsToNote: Det köparen bör känna till (kända brister, skador, kommande besiktning, saknade delar) – bara från uppgifterna. Tom lista om inget finns.

Skriv naturlig, korrekt svenska. Mätarställning skrivs i mil (1 mil = 10 km), t.ex. "12 300 mil".`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    highlight: { type: "STRING" },
    description: { type: "STRING" },
    conditionSummary: { type: "STRING" },
    highlights: { type: "ARRAY", items: { type: "STRING" } },
    thingsToNote: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "highlight", "description", "conditionSummary", "highlights", "thingsToNote"],
};

const clip = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\*\*|__|#+ /g, "").trim().slice(0, max) : "");
const clipList = (v: unknown, items: number, max: number) =>
  Array.isArray(v) ? v.map((x) => clip(x, max)).filter(Boolean).slice(0, items) : [];

/** Googles felsvar → begripligt meddelande på svenska (med Googles egen text). */
function googleError(status: number, body: string): string {
  let msg = "";
  let reason = "";
  try {
    const e = (JSON.parse(body) as { error?: { message?: string; status?: string; details?: { reason?: string }[] } }).error;
    msg = e?.message ?? "";
    reason = e?.details?.find((d) => d.reason)?.reason ?? e?.status ?? "";
  } catch {
    /* inget JSON-svar */
  }
  const google = msg ? ` Google svarade: "${msg.slice(0, 200)}"` : ` (Google svarade ${status})`;
  if (status === 429) return "AI:n är överbelastad eller kvoten är slut just nu. Försök igen om en stund." + google;
  if (reason === "API_KEY_INVALID" || /api key not valid/i.test(msg))
    return "GEMINI_API_KEY i Netlify är inte giltig. Kopiera nyckeln igen från Google AI Studio (aistudio.google.com → Get API key).";
  if (status === 403)
    return "Google nekar AI-nyckeln. Den kan vara begränsad till en annan webbplats eller sakna behörighet till Gemini API." + google;
  if (status === 404) return "Ingen av AI-modellerna är tillgänglig för nyckeln." + google;
  return "AI:n kunde inte svara." + google;
}

/** Anropar Gemini och returnerar svaret som JSON enligt `schema`. */
export async function gemini(
  env: Env,
  system: string,
  user: string,
  schema: object,
  temperature: number,
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  const key = env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new HttpError(503, "AI är inte aktiverat. Lägg in GEMINI_API_KEY i Netlify (samma nyckel som i Carflow).");
  // Google byter ut modeller ofta. "gemini-flash-latest" pekar alltid på den senaste Flash-modellen;
  // de andra är reserver om en modell inte finns eller inte är tillgänglig för nyckeln.
  const models = [...new Set([env.GEMINI_MODEL?.trim(), "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash-lite"].filter(Boolean) as string[])];

  let res: Response | null = null;
  let lastError = "";
  for (const model of models) {
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
        }),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new HttpError(504, timedOut ? "AI:n tog för lång tid på sig. Försök igen." : "Kunde inte nå AI-tjänsten. Försök igen.");
    }
    if (res.ok) break;
    const body = await res.text().catch(() => "");
    console.error("Gemini", model, res.status, body);
    lastError = googleError(res.status, body);
    // Modellen finns inte / är inte tillgänglig för nyckeln → prova nästa. Andra fel är samma för alla modeller.
    if (res.status !== 404 && !((res.status === 403 || res.status === 400) && /model/i.test(body))) break;
  }
  if (!res?.ok) throw new HttpError(502, lastError);

  const data = (await res.json()) as any;
  const raw = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    return JSON.parse(raw);
  } catch {
    console.error("Gemini gav ogiltig JSON", raw.slice(0, 500));
    throw new HttpError(502, "AI:n gav ett ofullständigt svar. Försök igen.");
  }
}

export async function writeCarAd(env: Env, car: Record<string, unknown>): Promise<AdText> {
  const out = await gemini(env, SYSTEM_PROMPT, `Uppgifter om bilen:\n${JSON.stringify(car, null, 2)}`, SCHEMA, 0.6);
  const ad: AdText = {
    title: clip(out.title, 120),
    highlight: clip(out.highlight, 200),
    description: clip(out.description, 8000),
    conditionSummary: clip(out.conditionSummary, 500),
    highlights: clipList(out.highlights, 8, 200),
    thingsToNote: clipList(out.thingsToNote, 8, 200),
  };
  if (!ad.title || !ad.description) throw new HttpError(502, "AI:n gav ett ofullständigt svar. Försök igen.");
  return ad;
}

/* ------------------------------------------------------------------ */
/* Utrustning: standard + möjliga tillval för bilen                     */
/* ------------------------------------------------------------------ */

const EQUIPMENT_PROMPT = `Du är expert på bilars utrustningsnivåer på den svenska marknaden.

Du får en bil (märke, modell, årsmodell och ibland utförande, motor, bränsle och växellåda) och en utrustningslista.
Svara med två listor:

1. standard – utrustning som är STANDARD på bilen, alltså sådant som varje exemplar av den här modellen och årsmodellen har från fabrik i Sverige.
   - Om utförande (t.ex. "Momentum", "Comfortline", "GT-Line") anges: det som är standard på just det utförandet.
   - Om inget utförande anges: BARA det som är standard på det enklaste utförandet (basnivån) som såldes i Sverige.
   - Ta inte med tillval, paket eller sådant som bara vissa exemplar har. Är du osäker – ta inte med punkten.
   - Använd bara namn exakt som de står i utrustningslistan.

2. options – utrustning som INTE är standard men som gick att få till just den här modellen och årsmodellen (tillval, paket, högre utföranden, vanlig eftermontering som dragkrok och motorvärmare).
   - Använd namn från utrustningslistan när de passar.
   - Modellspecifika tillval som inte finns i listan får du ta med med ett kort svenskt namn (max 4 ord), t.ex. "Harman Kardon-ljudsystem" eller "Volvo On Call".
   - Ta bara med sådant du är säker på finns till modellen. Högst 25 punkter.
   - Inget i options får finnas i standard.`;

const cleanItem = (x: unknown) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 60) : "");

export async function equipmentSuggestions(env: Env, car: Record<string, unknown>): Promise<{ standard: string[]; options: string[] }> {
  const out = await gemini(
    env,
    EQUIPMENT_PROMPT,
    `Bil:\n${JSON.stringify(car, null, 2)}\n\nUtrustningslista:\n${ALL_EQUIPMENT.join("\n")}`,
    {
      type: "OBJECT",
      properties: {
        standard: { type: "ARRAY", items: { type: "STRING", enum: ALL_EQUIPMENT } },
        options: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["standard", "options"],
    },
    0.1,
  );
  const byLower = new Map(ALL_EQUIPMENT.map((e) => [e.toLowerCase(), e]));
  const toCatalog = (x: string) => byLower.get(x.toLowerCase()) ?? x;
  const standard = [...new Set((Array.isArray(out.standard) ? out.standard : []).map(cleanItem).filter((x) => byLower.has(x.toLowerCase())).map(toCatalog))];
  const std = new Set(standard);
  const options = [...new Set((Array.isArray(out.options) ? out.options : []).map(cleanItem).filter(Boolean).map(toCatalog))]
    .filter((x) => !std.has(x))
    .slice(0, 30);
  return { standard, options };
}
