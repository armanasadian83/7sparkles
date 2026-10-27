import { resolve } from "node:path";
import { loadProjectEnv } from "./load-env.mjs";

loadProjectEnv();
const { getDatabase } = await import("../server/database.mjs");
const database = getDatabase();
database.close();
console.log(`Database initialized: ${resolve(process.env.DATA_DIR || "data", "store.sqlite")}`);
console.log("Migrations applied. No sample products, orders, or customers were added.");
