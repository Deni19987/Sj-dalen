// Skapar tabeller/funktioner (db/schema.sql) och lägger in startdata (db/seed.sql) i Neon.
// Användning:  npm run db:setup            (schema + startdata)
//              npm run db:setup -- --schema-only
// Läser DATABASE_URL_UNPOOLED (direktanslutning, rekommenderas för migreringar) eller DATABASE_URL.
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

// `neon link`/`neon env pull` skriver .env.local; .env stöds också.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* filen saknas – använd miljövariabler */
  }
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Saknar DATABASE_URL. Kör `neon env pull` eller lägg in den i .env.local.");
  process.exit(1);
}

const files = ["db/schema.sql", ...(process.argv.includes("--schema-only") ? [] : ["db/seed.sql"])];
const pool = new Pool({ connectionString: url });
try {
  for (const file of files) {
    process.stdout.write(`Kör ${file} … `);
    await pool.query(readFileSync(file, "utf8"));
    console.log("klart");
  }
} finally {
  await pool.end();
}
