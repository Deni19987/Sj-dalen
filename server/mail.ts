// E-post till kunder (chattsvar, överbjuden, auktionen slut) från verkstadens egen Gmail.
//
// Personalen trycker "Anslut Gmail" i admin och loggar in hos Google (OAuth, behörigheten
// gmail.send – appen kan bara skicka, inte läsa). Refresh token sparas i settings ('mail'),
// lämnas aldrig ut. OAuth-klienten är samma Google-projekt som redan används för registerutdrag:
// GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, eller GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET.
// Adressen <sajt>/api/mail/callback måste finnas under "Authorized redirect URIs" i Google Cloud.

import { HttpError, type Query } from "./http";

type Env = Record<string, string | undefined>;

const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "openid", "email"];

export interface MailAccount {
  email: string;
  refreshToken: string;
  connectedAt: string;
}

const clientId = (env: Env) => (env.GOOGLE_CLIENT_ID || env.GMAIL_CLIENT_ID || "").trim();
const clientSecret = (env: Env) => (env.GOOGLE_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET || "").trim();
export const mailConfigured = (env: Env) => !!(clientId(env) && clientSecret(env));

/** Sajtens publika adress utifrån anropet (admin.<domän> → <domän>). */
export function siteOrigin(req: Request) {
  const u = new URL(req.url);
  const host = u.host.replace(/^admin\./, "");
  return `${u.protocol}//${host}`;
}
export const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/mail/callback`;

export async function getMailAccount(query: Query): Promise<MailAccount | null> {
  const v = (await query("select value from settings where key = 'mail'"))[0]?.value;
  return v?.refreshToken ? v : null;
}

/** Adressen till Googles inloggning. state sparas och kontrolleras i callbacken. */
export async function mailAuthUrl(query: Query, env: Env, req: Request) {
  if (!mailConfigured(env))
    throw new HttpError(503, "Google-kopplingen saknas på servern (GMAIL_CLIENT_ID och GMAIL_CLIENT_SECRET i Netlify).");
  const state = crypto.randomUUID();
  await query(
    `insert into settings (key, value, updated_at) values ('mail_oauth', $1::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ state, expiresAt: Date.now() + 10 * 60_000 })],
  );
  const p = new URLSearchParams({
    client_id: clientId(env),
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Googles callback: byter koden mot en refresh token och sparar kontot. Returnerar adressen att gå vidare till. */
export async function mailCallback(query: Query, env: Env, req: Request) {
  const url = new URL(req.url);
  const back = (status: string, reason?: string) =>
    `/admin/installningar?epost=${status}${reason ? `&orsak=${encodeURIComponent(reason)}` : ""}#epost`;
  if (url.searchParams.get("error"))
    return back("fel", url.searchParams.get("error") === "access_denied" ? "Du avbröt inloggningen hos Google." : url.searchParams.get("error")!);
  const saved = (await query("select value from settings where key = 'mail_oauth'"))[0]?.value;
  if (!saved || saved.state !== url.searchParams.get("state") || saved.expiresAt < Date.now())
    return back("fel", "Inloggningen tog för lång tid eller startades från en annan flik. Försök igen.");
  await query("delete from settings where key = 'mail_oauth'");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "",
      client_id: clientId(env),
      client_secret: clientSecret(env),
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.refresh_token) return back("fel", `Google svarade: ${tok.error_description || tok.error || res.status}`);
  if (!String(tok.scope ?? "").includes("gmail.send"))
    return back("fel", "Du behöver godkänna att sajten får skicka e-post (kryssrutan hos Google).");

  const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json()).catch(() => ({}));
  const account: MailAccount = { email: info.email ?? "", refreshToken: tok.refresh_token, connectedAt: new Date().toISOString() };
  await query(
    `insert into settings (key, value, updated_at) values ('mail', $1::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(account)],
  );
  accessCache = null;
  return back("ansluten");
}

export async function disconnectMail(query: Query) {
  const acc = await getMailAccount(query);
  await query("delete from settings where key = 'mail'");
  accessCache = null;
  if (acc) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.refreshToken)}`, { method: "POST" }).catch(() => {});
}

let accessCache: { token: string; expires: number; refresh: string } | null = null;
async function accessToken(env: Env, acc: MailAccount) {
  if (accessCache && accessCache.refresh === acc.refreshToken && accessCache.expires > Date.now() + 60_000) return accessCache.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(env),
      client_secret: clientSecret(env),
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8000),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token)
    throw new Error(
      tok.error === "invalid_grant"
        ? "Gmail-kopplingen har gått ut. Anslut Gmail igen under Inställningar."
        : `Google svarade ${tok.error || res.status}`,
    );
  accessCache = { token: tok.access_token, expires: Date.now() + (tok.expires_in ?? 3000) * 1000, refresh: acc.refreshToken };
  return accessCache.token;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export interface MailMessage {
  to: string;
  subject: string;
  /** Rubrik i mejlet */
  heading: string;
  /** Stycken (vanlig text) */
  paragraphs: string[];
  /** Citerat meddelande, t.ex. verkstadens chattsvar */
  quote?: { from: string; text: string };
  button?: { label: string; url: string };
  fromName: string;
  footer?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(m: MailMessage) {
  const text = [
    m.heading,
    "",
    ...m.paragraphs.flatMap((p) => [p, ""]),
    ...(m.quote ? [`${m.quote.from}:`, m.quote.text, ""] : []),
    ...(m.button ? [`${m.button.label}: ${m.button.url}`, ""] : []),
    m.footer ?? "",
  ].join("\n");
  const html = `<!doctype html><html lang="sv"><body style="margin:0;background:#f2f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border-radius:18px;padding:28px 24px">
<p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#2563a6">${esc(m.fromName)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${esc(m.heading)}</h1>
${m.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#3a3a3c">${esc(p)}</p>`).join("")}
${m.quote ? `<div style="margin:16px 0;padding:14px 16px;background:#f2f2f5;border-radius:14px"><p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6e6e73">${esc(m.quote.from)}</p><p style="margin:0;font-size:16px;line-height:1.5;white-space:pre-wrap">${esc(m.quote.text)}</p></div>` : ""}
${m.button ? `<p style="margin:20px 0 4px"><a href="${esc(m.button.url)}" style="display:inline-block;background:#2563a6;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 22px;border-radius:999px">${esc(m.button.label)}</a></p>` : ""}
</div>
${m.footer ? `<p style="margin:16px 8px 0;font-size:12px;line-height:1.5;color:#8e8e93">${esc(m.footer)}</p>` : ""}
</div></body></html>`;
  return { text, html };
}

/** Skickar ett mejl från den anslutna Gmailen. Kastar aldrig – returnerar felet i stället. */
export async function sendMail(query: Query, env: Env, m: MailMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const acc = await getMailAccount(query);
    if (!acc) return { ok: false, error: "E-post är inte ansluten." };
    const { text, html } = render(m);
    const boundary = `b${crypto.randomUUID().replace(/-/g, "")}`;
    const mime = [
      `From: ${encodeHeader(m.fromName)} <${acc.email}>`,
      `To: ${m.to}`,
      `Subject: ${encodeHeader(m.subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64(text),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64(html),
      `--${boundary}--`,
    ].join("\r\n");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken(env, acc)}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: `Gmail svarade ${res.status}: ${err?.error?.message ?? ""}`.trim() };
    }
    return { ok: true };
  } catch (err) {
    console.error("[mail]", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
