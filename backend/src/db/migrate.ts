import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as runMigrate } from "drizzle-orm/postgres-js/migrator";
import { getSql } from "./client";

export async function migrate() {
  const sql = getSql();
  const db = drizzle(sql);
  await runMigrate(db, { migrationsFolder: "./src/db/migrations" });
}
