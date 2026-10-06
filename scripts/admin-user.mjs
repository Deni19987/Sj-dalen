// Skapar ett adminkonto (eller byter lösenord på ett befintligt) direkt i Neon.
// Användning:  npm run admin:user -- namn@exempel.se
// Lösenordet frågas efter i terminalen och sparas bara som hash (samma format som server/auth.ts).
import { createInterface } from "node:readline";
import { webcrypto as crypto } from "node:crypto";
import { neon } from "@neondatabase/serverless";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* filen saknas – använd miljövariabler */
  }
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Användning: npm run admin:user -- namn@exempel.se");
  process.exit(1);
}
const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("Saknar DATABASE_URL. Kör `neon env pull` eller lägg in den i .env.local.");
  process.exit(1);
}

/** Läser en rad utan att visa den i terminalen. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : "");
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await askHidden("Lösenord (minst 8 tecken): ");
if (password.length < 8) {
  console.error("Lösenordet måste vara minst 8 tecken.");
  process.exit(1);
}
if ((await askHidden("Upprepa lösenordet: ")) !== password) {
  console.error("Lösenorden matchar inte.");
  process.exit(1);
}

const b64url = (b) => Buffer.from(b).toString("base64url");
const iterations = 210_000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
const hash = `pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}`;

const sql = neon(url);
const rows = await sql.query(
  `insert into admin_users (email, password_hash) values ($1, $2)
   on conflict (email) do update set password_hash = excluded.password_hash
   returning (xmax = 0) as created`,
  [email, hash],
);
console.log(rows[0].created ? `Kontot ${email} är skapat.` : `Lösenordet för ${email} är uppdaterat.`);
