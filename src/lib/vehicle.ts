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

/** Snyggar till modellnamn från registret: "GOLF" → "Golf", men "XC60", "GTI" och "V70" behålls. */
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

/**
 * Delar "GOLF 1.4 TSI" i modell ("Golf") och motor ("1.4 TSI").
 * Motorn känns igen på slagvolym (1.4, 2,0) eller Volvos/BMW:s motorbeteckningar (D4, T5, B4).
 */
export function splitModelEngine(text: string): { model: string; engine: string | null } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const i = words.findIndex((w, idx) => idx > 0 && (/^\d[.,]\d(l|L)?$/.test(w) || /^[DTB][2-8]$/i.test(w)));
  if (i === -1) return { model: tidyModel(words.join(" ")), engine: null };
  return { model: tidyModel(words.slice(0, i).join(" ")), engine: words.slice(i).join(" ").replace(/,/, ".") };
}

/** Slagvolym i cm³ → "1.4 liter". */
export function engineFromVolume(cc: number | null): string | null {
  if (!cc || cc < 500 || cc > 9000) return null;
  return `${(cc / 1000).toFixed(1)} liter`;
}
