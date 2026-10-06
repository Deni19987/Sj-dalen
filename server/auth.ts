// Inloggning till admin med e-post och lösenord.
//
// - Huvudkontot kommer från miljövariablerna ADMIN_EMAIL + ADMIN_PASSWORD (sätts i Netlify) och
//   fungerar alltid, även om databasen är tom. Det är också reservkontot om någon låser ute sig.
// - Fler konton skapas i admin under Inställningar → Användare och sparas i tabellen admin_users
//   med lösenordet hashat (PBKDF2-SHA256).
// - Inloggning ger en signerad token (HMAC-SHA256) som skickas som "Authorization: Bearer …".
//   Signaturen inkluderar lösenordet/hashen, så när ett lösenord byts blir gamla tokens ogiltiga.

import type { Query } from "./http";

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 210_000;

export interface AuthConfig {
  /** Huvudkontots e-post (ADMIN_EMAIL). Saknas den används "admin". */
  email?: string;
  /** Huvudkontots lösenord (ADMIN_PASSWORD) */
  password?: string;
  /** Hemlighet för att signera tokens (ADMIN_SECRET) */
  secret?: string;
}

export interface AdminIdentity {
  id: string; // "owner" för huvudkontot, annars admin_users.id
  email: string;
  name: string;
  owner: boolean;
}

/* ------------------------------------------------------------------ */
/* Kodning och kryptografi                                              */
/* ------------------------------------------------------------------ */

function b64url(bytes: ArrayBuffer | Uint8Array) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function hmac(key: string, data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

/** Jämför två strängar utan att läcka information via tidsåtgång. */
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([hmac("cmp", a), hmac("cmp", b)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

/** Hashar ett lösenord: "pbkdf2$<iterationer>$<salt>$<hash>". */
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const actual = b64url(await pbkdf2(password, fromB64url(salt), Number(iter)));
  return safeEqual(actual, hash);
}

/* ------------------------------------------------------------------ */
/* Konton                                                               */
/* ------------------------------------------------------------------ */

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const ownerEmail = (cfg: AuthConfig) => normalizeEmail(cfg.email || "admin");

/** Nyckel för att signera tokens. Utan nyckel går det inte att logga in. */
const signingKey = (cfg: AuthConfig) => cfg.secret || cfg.password || "";

export const authEnabled = (cfg: AuthConfig) => !!signingKey(cfg);

/** Kontrollerar e-post + lösenord mot huvudkontot och admin_users. */
export async function checkLogin(cfg: AuthConfig, query: Query, email: string, password: string) {
  const e = normalizeEmail(email);
  if (cfg.password && e === ownerEmail(cfg)) {
    return (await safeEqual(password, cfg.password)) ? { identity: ownerIdentity(cfg), fingerprint: ownerFingerprint(cfg) } : null;
  }
  const rows = await query("select id::text, email, name, password_hash from admin_users where email = $1", [e]);
  const user = rows[0];
  // Räkna fram en hash även när kontot saknas, så att svarstiden inte avslöjar vilka konton som finns.
  const ok = await verifyPassword(password, user?.password_hash ?? "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAA");
  if (!user || !ok) return null;
  await query("update admin_users set last_login_at = now() where id::text = $1", [user.id]);
  return {
    identity: { id: user.id, email: user.email, name: user.name, owner: false } as AdminIdentity,
    fingerprint: user.password_hash as string,
  };
}

const ownerIdentity = (cfg: AuthConfig): AdminIdentity => ({ id: "owner", email: ownerEmail(cfg), name: "Huvudkonto", owner: true });
const ownerFingerprint = (cfg: AuthConfig) => `owner:${ownerEmail(cfg)}:${cfg.password}`;

/* ------------------------------------------------------------------ */
/* Tokens                                                               */
/* ------------------------------------------------------------------ */

export async function createToken(cfg: AuthConfig, identity: AdminIdentity, fingerprint: string, ttlMs: number) {
  const expiresAt = Date.now() + ttlMs;
  const payload = b64url(enc.encode(JSON.stringify({ sub: identity.id, exp: expiresAt })));
  const sig = await hmac(signingKey(cfg), `${payload}.${fingerprint}`);
  return { token: `${payload}.${sig}`, expiresAt, email: identity.email, name: identity.name, owner: identity.owner };
}

/** Returnerar vem som är inloggad, eller null om token saknas, är ogiltig eller har gått ut. */
export async function authenticate(cfg: AuthConfig, query: Query, token: string | null): Promise<AdminIdentity | null> {
  if (!authEnabled(cfg) || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let claims: { sub?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
  } catch {
    return null;
  }
  if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp < Date.now()) return null;

  let identity: AdminIdentity;
  let fingerprint: string;
  if (claims.sub === "owner") {
    if (!cfg.password) return null;
    identity = ownerIdentity(cfg);
    fingerprint = ownerFingerprint(cfg);
  } else {
    const rows = await query("select id::text, email, name, password_hash from admin_users where id::text = $1", [claims.sub]);
    if (!rows[0]) return null; // kontot är borttaget
    identity = { id: rows[0].id, email: rows[0].email, name: rows[0].name, owner: false };
    fingerprint = rows[0].password_hash;
  }
  return (await safeEqual(sig, await hmac(signingKey(cfg), `${payload}.${fingerprint}`))) ? identity : null;
}

export function bearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
