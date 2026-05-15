import { migrate } from "./migrate";

export async function ensureSchema() {
  await migrate();
}
