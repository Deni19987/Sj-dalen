// Skapar/uppdaterar tabeller och funktioner (db/schema.sql) och lägger in startdata (db/seed.sql) i Neon.
// Användning:  npm run db:setup                       schema + startdata (skriver över demobilar, tjänster,
//                                                     vanliga frågor och omdömen från seed.sql!)
//              npm run db:setup -- --schema-only      bara schemat
//              npm run db:setup -- --schema-only --force   kör schemat även om det redan är uppdaterat
// Production-deployer på Netlify kör `--schema-only --deploy` automatiskt (se netlify.toml).
// Läser DATABASE_URL_UNPOOLED (direktanslutning, rekommenderas för migreringar) eller DATABASE_URL.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const schemaOnly = args.includes("--schema-only");
const force = args.includes("--force");

if (args.includes("--deploy")) {
  // Nödbroms som kan sättas i Netlify utan kodändring
  if (/^(1|true)$/i.test(process.env.SKIP_DB_SETUP ?? "")) {
    console.log("SKIP_DB_SETUP är satt – hoppar över databasmigreringen.");
    process.exit(0);
  }
  // `netlify build`/`netlify deploy` på en egen dator räknas också som production – rör då inte databasen
  if (process.env.NETLIFY_LOCAL === "true") {
    console.log("Lokal Netlify-build – hoppar över migrering av production-databasen.");
    process.exit(0);
  }
}

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
  console.error(
    "Saknar DATABASE_URL. Lokalt: kör `neon env pull` eller lägg in den i .env.local. " +
      "På Netlify: se till att DATABASE_URL är tillgänglig för Builds (Site configuration → Environment variables).",
  );
  process.exit(1);
}

const schema = readFileSync("db/schema.sql", "utf8");
const schemaHash = createHash("sha256").update(schema).digest("hex");

// Hela schemat körs som EN transaktion (flera satser i ett anrop): går något fel rullas allt tillbaka.
// - Advisory lock: två deployer som migrerar samtidigt väntar på varandra.
// - Kort lock_timeout för själva ändringarna, så att en migrering aldrig blockerar sajten länge;
//   den ger hellre upp och försöker igen.
// - cars låses före bids, i samma ordning som place_bid (budgivning), så att de inte kan låsa varandra.
const schemaTransaction = `
set local lock_timeout = '60s';
select pg_advisory_xact_lock(4823517);
set local lock_timeout = '5s';
do $$ begin
  if to_regclass('public.cars') is not null and to_regclass('public.bids') is not null then
    lock table public.cars, public.bids in access exclusive mode;
  end if;
end $$;
${schema}
;
insert into public.schema_migrations (hash) values ('${schemaHash}') on conflict do nothing;
`;

const RETRYABLE = new Set(["40P01", "55P03"]); // deadlock, lock timeout
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const describe = (err) => {
  const e = /** @type {any} */ (err);
  const msg = e?.message || e?.error?.message || e?.type || String(err);
  return e?.code ? `${e.code} ${msg}` : msg;
};

async function schemaIsCurrent(pool) {
  try {
    const { rows } = await pool.query("select 1 from public.schema_migrations where hash = $1", [schemaHash]);
    return rows.length > 0;
  } catch (err) {
    if (/** @type {any} */ (err)?.code === "42P01") return false; // tabellen finns inte än
    throw err;
  }
}

const pool = new Pool({ connectionString: url });
try {
  if (!force && (await schemaIsCurrent(pool))) {
    console.log(`db/schema.sql är redan körd mot databasen (${schemaHash.slice(0, 12)}) – inget att göra.`);
  } else {
    for (let attempt = 1; ; attempt++) {
      process.stdout.write(`Kör db/schema.sql (${schemaHash.slice(0, 12)}) … `);
      try {
        await pool.query(schemaTransaction);
        console.log("klart");
        break;
      } catch (err) {
        console.log("misslyckades");
        if (!RETRYABLE.has(/** @type {any} */ (err)?.code) || attempt >= 4) throw err;
        console.log(`  ${describe(err)} – försöker igen (${attempt}/3) …`);
        await sleep(attempt * 3000);
      }
    }
  }
  if (!schemaOnly) {
    process.stdout.write("Kör db/seed.sql … ");
    await pool.query(readFileSync("db/seed.sql", "utf8"));
    console.log("klart");
  }
} catch (err) {
  console.error(`\nDatabasmigreringen misslyckades: ${describe(err)}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
