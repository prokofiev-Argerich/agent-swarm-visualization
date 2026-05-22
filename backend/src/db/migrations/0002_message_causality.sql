-- Message causality: soft reference to the upstream message that triggered this one.
-- Nullable: human messages, initial messages, and system messages have no upstream.
-- No foreign key: kept as soft reference to avoid cascade complications on agent/message deletes.

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "caused_by" uuid;

CREATE INDEX IF NOT EXISTS "idx_messages_caused_by" ON "messages"("caused_by");
