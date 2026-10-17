import { AsyncLocalStorage } from "node:async_hooks";

import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import * as schema from "./schema";

type Batch = readonly [BatchItem<"pg">, ...BatchItem<"pg">[]];

const globalForPool = globalThis as unknown as { pgPool?: Pool };

// One pool per process (survives dev hot reloads). Small on purpose: the tiny RDS instance caps connections.
const pool =
  globalForPool.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 5) });
globalForPool.pgPool = pool;

/** The connection of the `db.batch` running in this async context, if any. */
const batchClient = new AsyncLocalStorage<PoolClient>();

// Drizzle queries are lazy and bound to the client given here. Routing each query through this proxy lets
// `db.batch` run statements built from `db` on its own transaction connection, keeping Drizzle's result mapping.
const router = { query: (...args: Parameters<Pool["query"]>) => (batchClient.getStore() ?? pool).query(...args) };

const base = drizzle({ client: router as unknown as Pool, schema });

/**
 * Runs `statements` in order as ONE transaction and returns their results (like Drizzle's neon-http `db.batch`).
 * Any error rolls everything back and is rethrown, so a guard raising a Postgres error aborts the whole batch.
 */
async function batch<T extends Batch>(statements: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const results = await batchClient.run(client, async () => {
      const out: unknown[] = [];
      for (const statement of statements) out.push(await statement);
      return out;
    });
    await client.query("COMMIT");
    return results as { -readonly [K in keyof T]: Awaited<T[K]> };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const db = Object.assign(base, { batch });
