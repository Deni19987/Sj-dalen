// Märken och uppdelning av "fabrikat + modell + motor" (används i admin och av servern).

export const MAKES = [
  "Alfa Romeo", "Audi", "BMW", "BYD", "Chevrolet", "Chrysler", "Citroën", "Cupra", "Dacia", "Dodge", "DS", "Fiat", "Ford",
  "Honda", "Hyundai", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Mazda", "Mercedes-Benz", "MG", "Mini", "Mitsubishi",
  "Nissan", "Opel", "Peugeot", "Polestar", "Porsche", "Renault", "Saab", "Seat", "Skoda", "Smart", "SsangYong", "Subaru",
  "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo",
];

// Varianter som förekommer i registret.
const MAKE_ALIASES: Record<string, string> = {
  "mercedes benz": "Mercedes-Benz",
  mercedes: "Mercedes-Benz",
  vw: "Volkswagen",
  "škoda": "Skoda",
  citroen: "Citroën",
  "land-rover": "Land Rover",
  "alfa-romeo": "Alfa Romeo",
};

const fold = (s: string) => s.toLocaleLowerCase("sv-SE").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Snyggar till namn från registret: "GOLF" → "Golf", "ENJOY" → "Enjoy", men "XC60", "GTI" och "V70" behålls. */
export function tidyModel(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (/^[A-ZÅÄÖ]{4,}$/.test(w) ? w.charAt(0) + w.slice(1).toLocaleLowerCase("sv-SE") : w))
    .join(" ");
}

/** Hittar ett känt märke i början av texten. Returnerar märket och resten av texten. */
export function matchMake(text: string): { make: string; rest: string } | null {
  const t = fold(text);
  const candidates = [
    ...MAKES.map((m) => [fold(m), m] as const),
    ...Object.entries(MAKE_ALIASES).map(([k, v]) => [fold(k), v] as const),
  ].sort((a, b) => b[0].length - a[0].length);
  for (const [key, make] of candidates) {
    if (t === key || t.startsWith(key + " ") || t.startsWith(key + "-")) {
      const rest = text.trim().split(/\s+/).slice(key.split(" ").length).join(" ").replace(/^-/, "").trim();
      return { make, rest };
    }
  }
  return null;
}

// Ord som hör till motorbeteckningen (efter slagvolymen), t.ex. "1.4 TSI", "1.6 CDTI ecoFLEX", "2.0 TDI 150".
const ENGINE_WORD =
  /^(t|i|d|e|tsi|tdi|tfsi|fsi|tdci|cdi|cdti|crdi|dci|hdi|bluehdi|puretech|vti|thp|gdi|t-gdi|tgdi|mpi|ecoboost|ecoflex|ecotec|turbo|biturbo|hybrid|e-hybrid|plug-in|phev|d-4d|d4d|vvt-i|vvti|skyactiv(-[gdx])?|multijet|jtd|jtdm|tce|sce|bluemotion|bluetec|cng|lpg|flexifuel|ffv|\d{2,3}(hk|ps|kw)?)$/i;
const ENGINE_START = (w: string) => /^\d[.,]\d(l)?$/i.test(w) || /^[DTB][2-8]$/i.test(w);

/**
 * Delar "CORSA 1.2 ENJOY" i modell ("Corsa"), motor ("1.2") och utförande ("Enjoy").
 * Motorn känns igen på slagvolym (1.4, 2,0) eller motorbeteckningar som D4, T5, B4,
 * följt av motorord som TSI, CDTI, ecoFLEX eller hästkrafter. Det som står efter motorn är utförandet.
 */
export function splitModelEngine(text: string): { model: string; engine: string | null; trim: string | null } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const i = words.findIndex((w, idx) => idx > 0 && ENGINE_START(w));
  if (i === -1) return { model: tidyModel(words.join(" ")), engine: null, trim: null };
  let j = i + 1;
  while (j < words.length && ENGINE_WORD.test(words[j])) j++;
  const trim = words.slice(j).join(" ");
  return {
    model: tidyModel(words.slice(0, i).join(" ")),
    engine: words.slice(i, j).join(" ").replace(/,/, "."),
    trim: trim ? tidyModel(trim) : null,
  };
}

/** Delar en motorbeteckning från ev. utförande efter den: "1.2 ENJOY" → motor "1.2", utförande "Enjoy". */
export function splitEngineTrim(text: string): { engine: string; trim: string | null } {
  const r = splitModelEngine(`x ${text}`);
  return r.engine ? { engine: r.engine, trim: r.trim } : { engine: text.trim(), trim: null };
}

/** Slagvolym i cm³ → "1.4 liter". */
export function engineFromVolume(cc: number | null): string | null {
  if (!cc || cc < 500 || cc > 9000) return null;
  return `${(cc / 1000).toFixed(1)} liter`;
}
