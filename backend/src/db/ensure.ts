import { ensureSchema } from "./init";

let ensureSchemaPromise: Promise<void> | null = null;

export function ensureSchemaOnce() {
  ensureSchemaPromise ??= ensureSchema().catch((error) => {
    ensureSchemaPromise = null;
    throw error;
  });

  return ensureSchemaPromise;
}

export function isMissingTableError(error: unknown) {
  const err = error as {
    code?: string;
    cause?: { code?: string; message?: string };
    message?: string;
  };

  const code = err?.code ?? err?.cause?.code;
  const msg = (err?.message ?? "") + (err?.cause?.message ?? "");

  // 42P01 = relation/table doesn't exist
  // 42703 = column doesn't exist (e.g. phase_id not yet added by migration)
  if (code === "42P01" || code === "42703") return true;

  // broader match: any "does not exist" from Postgres is likely a missing schema object
  if (
    msg.includes("does not exist") &&
    (msg.includes("relation") || msg.includes("column") || msg.includes("table"))
  ) {
    return true;
  }

  return false;
}
