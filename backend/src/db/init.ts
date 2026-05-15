import { getSql } from "./client";
import { migrate } from "./migrate";

export async function ensureSchema() {
  const sql = getSql();

  // Ensure drizzle_migrations table exists so migrate() can track state
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `;

  await migrate();
}
