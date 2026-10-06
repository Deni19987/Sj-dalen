// Gemensamma hjälpfunktioner för API:t (svar, validering, felhantering).

/** Kör en parametriserad SQL-fråga och returnerar raderna. */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;

/** Lagring för bildfiler (Netlify Blobs i produktion, filsystemet lokalt). */
export interface BlobStore {
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, data: ArrayBuffer): Promise<void>;
  delete(key: string): Promise<void>;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

// Publikt innehåll får cachas kort i CDN:et; auktionsdata ska vara färsk.
export const SHORT_CACHE = { "cache-control": "public, max-age=0, s-maxage=60" };
export const NO_CACHE = { "cache-control": "no-store" };

export async function body(req: Request): Promise<Record<string, any>> {
  try {
    const data = await req.json();
    if (data && typeof data === "object") return data;
  } catch {
    /* faller igenom */
  }
  throw new HttpError(400, "Ogiltig förfrågan.");
}

export function str(v: unknown, field: string, { min = 1, max = 200, optional = false } = {}) {
  if (v == null || v === "") {
    if (optional) return null;
    throw new HttpError(400, `Fältet ${field} saknas.`);
  }
  if (typeof v !== "string") throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  const s = v.trim();
  if (s.length === 0 && optional) return null;
  if (s.length < min || s.length > max) throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  return s;
}

/** Valfri text som sparas som tom sträng när den saknas. */
export const text = (v: unknown, field: string, max: number) => str(v, field, { max, optional: true }) ?? "";

export function int(v: unknown, field: string, min: number, max: number) {
  const n = Number(v);
  if (v === "" || v == null || !Number.isInteger(n) || n < min || n > max)
    throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  return n;
}

export const optInt = (v: unknown, field: string, min: number, max: number) =>
  v == null || v === "" ? null : int(v, field, min, max);

export function bool(v: unknown) {
  return v === true || v === "true";
}

export function oneOf<T extends string>(v: unknown, field: string, values: readonly T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  return v as T;
}

export function strList(v: unknown, field: string, { maxItems = 20, max = 200 } = {}) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > maxItems) throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .map((x) => {
      if (x.length > max) throw new HttpError(400, `För lång text i ${field}.`);
      return x;
    });
}

export function email(v: unknown) {
  const s = str(v, "e-post", { max: 254 })!;
  if (!EMAIL_RE.test(s)) throw new HttpError(400, "Ogiltig e-postadress.");
  return s;
}

export function isoDate(v: unknown) {
  if (typeof v !== "string" || !DATE_RE.test(v)) throw new HttpError(400, "Ogiltigt datum.");
  return v;
}

export function timestamp(v: unknown, field: string) {
  const d = typeof v === "string" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new HttpError(400, `Ogiltigt värde för ${field}.`);
  return d.toISOString();
}

/** Skriver om Postgres-fel som funktionerna kastar (raise exception) till 400 med text. */
export function dbError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  if (e?.code === "P0001" && e.message) throw new HttpError(400, e.message);
  if (e?.code === "23514") throw new HttpError(400, "Ogiltiga uppgifter.");
  if (e?.code === "23503") throw new HttpError(409, "Posten används på andra ställen och kan inte tas bort.");
  if (e?.code === "23505") throw new HttpError(409, "Det finns redan en post med samma uppgifter.");
  throw err;
}
