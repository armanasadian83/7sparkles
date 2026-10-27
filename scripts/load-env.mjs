import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

/** Match Next's env precedence while preserving explicit shell/host variables. */
export function loadProjectEnv() {
  const mode = process.env.NODE_ENV || "development";
  const files = [`.env.${mode}.local`, ...(mode === "test" ? [] : [".env.local"]), `.env.${mode}`, ".env"];
  for (const filename of files) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
