import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type Db = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDrizzleDb?: Db;
};

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Add it to your deployment environment variables before using database-backed routes.",
    );
  }

  return databaseUrl;
}

export function getPool() {
  if (globalForDb.__arenaNextJsPostgresqlPool) {
    return globalForDb.__arenaNextJsPostgresqlPool;
  }

  const nextPool = new Pool({
    connectionString: requireDatabaseUrl(),
  });

  globalForDb.__arenaNextJsPostgresqlPool = nextPool;
  return nextPool;
}

export function getDb() {
  if (globalForDb.__arenaNextJsDrizzleDb) {
    return globalForDb.__arenaNextJsDrizzleDb;
  }

  const nextDb = drizzle(getPool());
  globalForDb.__arenaNextJsDrizzleDb = nextDb;
  return nextDb;
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const realPool = getPool();
    const value = Reflect.get(realPool, prop, realPool) as unknown;
    return typeof value === "function" ? value.bind(realPool) : value;
  },
});

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const realDb = getDb();
    const value = Reflect.get(realDb, prop, realDb) as unknown;
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});
