// AI-tolkning av registerutdraget från Transportstyrelsen.
//
// AI:n får bara läsa ut uppgifter som står i mejlet. Som extra skydd kontrolleras varje värde
// mot mejltexten – ett värde som inte går att hitta där slängs. Ägarens namn, adress och
// personnummer tas bort innan texten skickas till AI:n.

import { gemini } from "./ai";
import type { Env } from "./vehicle-lookup";

export interface ExtractedVehicle {
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
}

// Rubriker vars värden är personuppgifter. Värdet efter rubriken ersätts innan AI:n får texten.
const PERSONAL_LABELS = [
  "Ägare och brukare",
  "Föregående ägare",
  "Ägare",
  "Brukare",
  "Innehavare",
  "Namn",
  "Adress",
  "Utdelningsadress",
  "c/o",
  "Postnummer",
  "Postort",
  "Personnummer",
  "Organisationsnummer",
];

/** Tar bort personuppgifter ur registerutdraget. */
export function redactPersonalData(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  const isPersonal = (l: string) => PERSONAL_LABELS.some((p) => l.trim().toLowerCase().startsWith(p.toLowerCase()));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isPersonal(line) && !/antal ägare/i.test(line)) {
      // "Etikett: värde" på samma rad, eller etikett på en rad och värdet på nästa.
      const label = PERSONAL_LABELS.find((p) => line.trim().toLowerCase().startsWith(p.toLowerCase()))!;
      out.push(`${label}: [borttaget]`);
      if (line.trim().length <= label.length + 1 && i + 1 < lines.length) i++;
      continue;
    }
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\b(19|20)?\d{6}[-+]?\d{4}\b/g, "[borttaget]") // person-/organisationsnummer
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[borttaget]"); // e-postadresser
}

const PROMPT = `Du läser ett registerutdrag (fordonsuppgifter) från Transportstyrelsen och fyller i ett formulär.

ABSOLUT VIKTIGAST – HITTA INTE PÅ:
- Använd BARA uppgifter som står i texten. Gissa aldrig och använd inte din egen kunskap om bilmodeller.
- Står en uppgift inte i texten: svara null.
- Skriv värden så som de står i texten (t.ex. fabrikat "VOLVO", färg "SVART"). Översätt eller tolka inte.
- Räkna inte ut något: ange tal precis som de står, och ange enheten separat.

Fält:
- make: Fabrikat / märke.
- model: Handelsbeteckning / modell.
- year: Fordonsår eller modellår (fyrsiffrigt år) om det uttryckligen står. Använd INTE datum för registrering eller besiktning.
- color: Färg.
- fuel: Drivmedel / bränsle.
- gearbox: Växellåda.
- bodyType: Kaross / karosseri.
- vehicleStatus: Fordonsstatus, t.ex. "I trafik" eller "Avställd" (utan datum).
- owners: Antal ägare (heltal).
- firstRegistered: Datum då fordonet togs i trafik / registrerades första gången (ÅÅÅÅ-MM-DD).
- lastInspection: Senast godkända besiktning (ÅÅÅÅ-MM-DD).
- nextInspection: Nästa besiktning senast (ÅÅÅÅ-MM-DD).
- mileage + mileageUnit: Noterad mätarställning som tal, och enheten ("km" eller "mil") som den står i texten. null om enhet saknas.
- power + powerUnit: Motoreffekt som tal, och enheten ("kW" eller "hk").`;

const str = { type: "STRING", nullable: true };
const num = { type: "NUMBER", nullable: true };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    make: str,
    model: str,
    year: num,
    color: str,
    fuel: str,
    gearbox: str,
    bodyType: str,
    vehicleStatus: str,
    owners: num,
    firstRegistered: str,
    lastInspection: str,
    nextInspection: str,
    mileage: num,
    mileageUnit: { type: "STRING", nullable: true, enum: ["km", "mil"] },
    power: num,
    powerUnit: { type: "STRING", nullable: true, enum: ["kW", "hk"] },
  },
};

const norm = (s: string) => s.toLocaleLowerCase("sv-SE").replace(/\s+/g, "");
const digits = (s: string) => s.replace(/[\s .]/g, "");

/** Finns texten i mejlet? (skiftläge och mellanslag spelar ingen roll) */
function inText(haystack: string, v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return norm(haystack).includes(norm(v)) ? v.trim() : null;
}

/** Finns talet i mejlet? Tusentalsavgränsare som "15 012" räknas som 15012. */
function numInText(haystack: string, v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < min || v > max) return null;
  return new RegExp(`(^|\\D)${v}(\\D|$)`).test(digits(haystack)) ? v : null;
}

/** Som numInText, men talet måste stå direkt efter någon av rubrikerna (samma eller nästa rad). */
function numNearLabel(haystack: string, labels: string[], v: unknown, min: number, max: number): number | null {
  const lower = haystack.toLocaleLowerCase("sv-SE");
  for (const label of labels) {
    let at = lower.indexOf(label.toLocaleLowerCase("sv-SE"));
    while (at !== -1) {
      const after = haystack.slice(at + label.length).split("\n").slice(0, 2).join("\n");
      if (numInText(after, v, min, max) != null) return v as number;
      at = lower.indexOf(label.toLocaleLowerCase("sv-SE"), at + 1);
    }
  }
  return null;
}

function dateInText(haystack: string, v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return haystack.includes(v) ? v : null;
}

const capitalize = (s: string | null) =>
  s ? s.charAt(0).toLocaleUpperCase("sv-SE") + s.slice(1).toLocaleLowerCase("sv-SE") : null;

/** Läser ut fordonsuppgifter med AI. Returnerar null om AI inte är aktiverat eller inte svarar. */
export async function extractWithAi(env: Env, emailText: string): Promise<ExtractedVehicle | null> {
  if (!env.GEMINI_API_KEY?.trim()) return null;
  const text = redactPersonalData(emailText).slice(0, 12_000);
  let out: Record<string, unknown>;
  try {
    out = await gemini(env, PROMPT, `Registerutdrag:\n"""\n${text}\n"""`, SCHEMA, 0, 7_000);
  } catch (err) {
    console.error("AI-tolkning av registerutdrag misslyckades", err);
    return null;
  }

  // Kontroll: bara värden som faktiskt står i mejlet får följa med.
  const mileage = numNearLabel(text, ["mätarställning"], out.mileage, 0, 5_000_000);
  const power = numNearLabel(text, ["effekt"], out.power, 1, 2_000);
  const year = numNearLabel(text, ["modellår", "fordonsår", "årsmodell"], out.year, 1900, 2100);
  return {
    make: capitalize(inText(text, out.make)),
    model: inText(text, out.model),
    year,
    color: capitalize(inText(text, out.color)),
    fuel: capitalize(inText(text, out.fuel)),
    gearbox: capitalize(inText(text, out.gearbox)),
    bodyType: capitalize(inText(text, out.bodyType)),
    vehicleStatus: inText(text, out.vehicleStatus),
    owners: numNearLabel(text, ["antal ägare"], out.owners, 0, 99),
    firstRegistered: dateInText(text, out.firstRegistered),
    lastInspection: dateInText(text, out.lastInspection),
    nextInspection: dateInText(text, out.nextInspection),
    mileageKm: mileage == null ? null : out.mileageUnit === "mil" ? mileage * 10 : out.mileageUnit === "km" ? mileage : null,
    // Effekt i kW räknas om till hästkrafter (1 kW = 1,36 hk).
    horsepower: power == null ? null : out.powerUnit === "hk" ? power : out.powerUnit === "kW" ? Math.round(power * 1.36) : null,
  };
}
