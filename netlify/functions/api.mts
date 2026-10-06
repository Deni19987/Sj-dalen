import { neon } from "@neondatabase/serverless";
import { createHandler, type Query } from "../../server/handler";

// DATABASE_URL = Neons pooled connection string (sätts i Netlify → Environment variables).
const sql = neon(process.env.DATABASE_URL!);
const query: Query = (text, params = []) => sql.query(text, params) as Promise<Record<string, any>[]>;

export default createHandler(query);

export const config = { path: "/api/*" };
