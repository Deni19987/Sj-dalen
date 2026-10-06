// Lokalt API för utveckling: `npm run dev:local`.
// Kör samma API som på Netlify, men mot en inbyggd Postgres (PGlite) och med bilder
// på disk. All data sparas i .local-data/ så att den finns kvar mellan omstarter.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import type { BlobStore, Query } from "./http";

const DATA_DIR = ".local-data";

function fileBlobs(root: string): BlobStore {
  const file = (key: string) => join(root, ...key.split("/").map((p) => p.replace(/[^a-zA-Z0-9_-]/g, "")));
  return {
    async get(key) {
      try {
        const buf = await readFile(file(key));
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      } catch {
        return null;
      }
    },
    async set(key, data) {
      await mkdir(dirname(file(key)), { recursive: true });
      await writeFile(file(key), new Uint8Array(data));
    },
    async delete(key) {
      await rm(file(key), { force: true });
    },
  };
}

async function createLocalDb(): Promise<Query> {
  const { PGlite } = await import("@electric-sql/pglite");
  const fresh = !existsSync(join(DATA_DIR, "pg"));
  await mkdir(DATA_DIR, { recursive: true });
  const db = new PGlite(join(DATA_DIR, "pg"));
  await db.exec(await readFile("db/schema.sql", "utf8"));
  if (fresh) await db.exec(await readFile("db/seed.sql", "utf8"));
  return async (text, params = []) => (await db.query(text, params)).rows as Record<string, any>[];
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function localApi(env: Record<string, string>): Plugin {
  return {
    name: "sjodalen-local-api",
    apply: "serve",
    async configureServer(server: ViteDevServer) {
      if (env.LOCAL_API !== "true") return;
      const query = await createLocalDb();
      const blobs = fileBlobs(join(DATA_DIR, "blobs"));
      const password = env.ADMIN_PASSWORD || "admin";
      server.config.logger.info(
        `\n  Lokalt API med inbyggd databas (${DATA_DIR}/). Admin: /admin – lösenord "${password}"\n`,
      );

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        try {
          // Laddas via Vite så att ändringar i server/ slår igenom utan omstart.
          const { createHandler } = (await server.ssrLoadModule("/server/handler.ts")) as typeof import("./handler");
          const handle = createHandler(query, { blobs, auth: { password, secret: env.ADMIN_SECRET } });
          await sendResponse(res, await handle(await toRequest(req)));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
