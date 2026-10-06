// Inloggning till admin. Ett lösenord (ADMIN_PASSWORD) ger en signerad token
// (HMAC-SHA256) som skickas som "Authorization: Bearer …". Inga sessioner i databasen.
// Byts lösenordet blir alla gamla tokens ogiltiga.

const enc = new TextEncoder();

export interface AuthConfig {
  password?: string;
  /** Valfri extra hemlighet (ADMIN_SECRET) som blandas in i signeringsnyckeln. */
  secret?: string;
}

function b64url(bytes: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

const signingKey = (cfg: AuthConfig) => `sjodalen-admin:${cfg.secret ?? ""}:${cfg.password}`;

/** Jämför två strängar utan att läcka information via tidsåtgång. */
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([hmac("cmp", a), hmac("cmp", b)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(cfg: AuthConfig, password: string) {
  if (!cfg.password) return false;
  return safeEqual(password, cfg.password);
}

export async function createToken(cfg: AuthConfig, ttlMs: number) {
  const expiresAt = Date.now() + ttlMs;
  const payload = String(expiresAt);
  return { token: `${payload}.${await hmac(signingKey(cfg), payload)}`, expiresAt };
}

export async function verifyToken(cfg: AuthConfig, token: string | null) {
  if (!cfg.password || !token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !/^\d+$/.test(payload) || Number(payload) < Date.now()) return false;
  return safeEqual(sig, await hmac(signingKey(cfg), payload));
}

export function bearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
