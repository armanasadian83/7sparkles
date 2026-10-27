import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { loadProjectEnv } from "./load-env.mjs";

loadProjectEnv();
const file = resolve(".env.local");
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const saved = parseEnv(current);
const additions = [];
const existingKey = process.env.ADMIN_SETUP_KEY;
let setupKey = existingKey;
if (existingKey && !existingKey.startsWith("replace-") && existingKey.length >= 32) {
  console.log("An admin setup key is already configured. It was not changed.");
} else {
  if (saved.ADMIN_SETUP_KEY !== undefined) {
    throw new Error(".env.local already defines ADMIN_SETUP_KEY. Replace that placeholder manually with a random 32+ character value; setup will not overwrite existing configuration.");
  }
  setupKey = randomBytes(32).toString("hex");
  additions.push(`ADMIN_SETUP_KEY=${setupKey}`);
}
if (!process.env.DATA_DIR) additions.push("DATA_DIR=./data");
if (!process.env.APP_URL) additions.push("APP_URL=http://localhost:3000");
if (additions.length) {
  const text = `${current && !current.endsWith("\n") ? "\n" : ""}${additions.join("\n")}\n`;
  if (existsSync(file)) appendFileSync(file, text, { mode: 0o600 });
  else writeFileSync(file, text, { mode: 0o600, flag: "wx" });
  console.log(`Local configuration prepared: ${file}`);
}
console.log("Start or restart the app, then open /admin/setup.");
console.log("Enter the ADMIN_SETUP_KEY from your private environment configuration and choose your own admin email and password.");
console.log("The command does not create an administrator or add sample catalog data.");
if (process.argv.includes("--show-key")) console.log(`ADMIN_SETUP_KEY=${setupKey}`);
