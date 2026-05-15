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

  return (
    err?.code === "42P01" ||
    err?.cause?.code === "42P01" ||
    err?.message?.includes('relation "files" does not exist') ||
    err?.cause?.message?.includes('relation "files" does not exist')
  );
}
