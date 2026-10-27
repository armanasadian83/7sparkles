import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadProjectEnv } from "./load-env.mjs";

loadProjectEnv();
const { getDatabase } = await import("../server/database.mjs");
const directory = resolve(process.env.DATA_DIR || "data", "backups");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = resolve(directory, `store-${stamp}-${randomUUID().slice(0, 8)}.sqlite`);
const database = getDatabase();
try {
  // VACUUM INTO creates a consistent snapshot, including committed WAL content.
  // It never overwrites a previous backup and is available on Node 22.13's SQLite.
  database.prepare("VACUUM INTO ?").run(destination);
  console.log(`Database backup created: ${destination}`);
  console.log("Back up the uploads directory separately; it contains product images.");
} finally {
  database.close();
}
