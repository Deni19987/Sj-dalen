import { neon } from "@neondatabase/serverless";
import { runAuctionChecks } from "../../server/auction";
import type { Query } from "../../server/http";

// Var 5:e minut: notiser när en auktion slutar om en timme eller är avslutad, mejl till vinnaren
// och påminnelser om betalning/hämtning (se server/auction.ts). Ingår i Netlify utan extra kostnad.
const sql = neon(process.env.DATABASE_URL!);
const query: Query = (text, params = []) => sql.query(text, params) as Promise<Record<string, any>[]>;

export default async () => {
  // URL sätts av Netlify till sajtens huvudadress – används i länkarna i mejlen.
  const origin = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const done = await runAuctionChecks(query, process.env, origin);
  if (done.length) console.log("[auction-checks]", done.join(", "));
  return new Response(null, { status: 204 });
};

export const config = { schedule: "*/5 * * * *" };
