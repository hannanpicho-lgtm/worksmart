import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function stripOptionalQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadEnvFile(path = ".env.pipeline") {
  const absPath = resolve(process.cwd(), path);
  if (!existsSync(absPath)) {
    return { loaded: 0, found: false, path: absPath };
  }

  const content = readFileSync(absPath, "utf8");
  const lines = content.split(/\r?\n/);
  let loaded = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const firstEquals = line.indexOf("=");
    if (firstEquals <= 0) continue;
    const key = line.slice(0, firstEquals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    const value = stripOptionalQuotes(line.slice(firstEquals + 1).trim());
    process.env[key] = value;
    loaded += 1;
  }

  return { loaded, found: true, path: absPath };
}
