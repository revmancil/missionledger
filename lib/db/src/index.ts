import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Parse PostgreSQL `numeric`/`decimal` columns as JavaScript floats.
// Without this, pg returns them as strings, breaking all arithmetic on monetary values.
// OID 1700 = numeric/decimal
pg.types.setTypeParser(1700, parseFloat);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
