import { getStore } from "@netlify/blobs";
import { neon } from "@neondatabase/serverless";
import { createHandler, type BlobStore, type Query } from "../../server/handler";

// DATABASE_URL = Neons pooled connection string (sätts i Netlify → Environment variables).
const sql = neon(process.env.DATABASE_URL!);
const query: Query = (text, params = []) => sql.query(text, params) as Promise<Record<string, any>[]>;

// Bilbilder sparas i Netlify Blobs (ingår i Netlify, ingen extra konfiguration behövs).
const blobs: BlobStore = {
  get: (key) => getStore({ name: "car-images", consistency: "strong" }).get(key, { type: "arrayBuffer" }),
  set: async (key, data) => {
    await getStore({ name: "car-images", consistency: "strong" }).set(key, data);
  },
  delete: (key) => getStore({ name: "car-images", consistency: "strong" }).delete(key),
};

export default createHandler(query, {
  blobs,
  // ADMIN_PASSWORD (och gärna ADMIN_SECRET) sätts i Netlify → Environment variables.
  auth: { password: process.env.ADMIN_PASSWORD, secret: process.env.ADMIN_SECRET },
});

export const config = { path: "/api/*" };
