// AI-skriven annonstext för auktionsbilar (Google Gemini – samma AI-nyckel som Carflow).
//
// Miljövariabler:
//   GEMINI_API_KEY   – krävs
//   GEMINI_MODEL     – valfri, standard "gemini-2.5-flash"

import { HttpError } from "./http";
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
- description: Huvudtexten, 2–4 korta stycken separerade med en tom rad. Inled med vad bilen är och vem den passar. Ta med skick, historik och utrustning från uppgifterna. Avsluta med en mening om att bilen är genomgången i vår verkstad och säljs på auktion (bara om "verkstadsbesiktigad" är sann, annars att den säljs på auktion). Ingen markdown, inga emojis, inga rubriker, inga punktlistor, inga priser.
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

export async function writeCarAd(env: Env, car: Record<string, unknown>): Promise<AdText> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, "AI är inte aktiverat. Lägg in GEMINI_API_KEY i Netlify (samma nyckel som i Carflow).");
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: `Uppgifter om bilen:\n${JSON.stringify(car, null, 2)}` }] }],
      generationConfig: {
        temperature: 0.6,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        // Snabbare svar – annonstext behöver inget långt "tänkande".
        ...(model.startsWith("gemini-2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });
  if (!res.ok) {
    console.error("Gemini", res.status, await res.text().catch(() => ""));
    throw new HttpError(502, res.status === 429 ? "AI:n är överbelastad just nu. Försök igen om en stund." : "AI:n kunde inte skriva annonsen. Försök igen.");
  }
  const data = (await res.json()) as any;
  const raw = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  let out: Record<string, unknown>;
  try {
    out = JSON.parse(raw);
  } catch {
    console.error("Gemini gav ogiltig JSON", raw.slice(0, 500));
    throw new HttpError(502, "AI:n gav ett ofullständigt svar. Försök igen.");
  }
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
