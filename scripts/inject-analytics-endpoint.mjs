#!/usr/bin/env node
/**
 * Optionally set contact form data-analytics-endpoint in public/index.html from env.
 * Used in CI (Cloudflare Pages) so production can ingest to the Worker without
 * committing a per-account *.workers.dev URL. Safe no-op when env is unset.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const urlRaw = (process.env.FORM_ANALYTICS_WORKER_URL || "").trim();
const indexPath = resolve(process.cwd(), "public/index.html");

if (!urlRaw) {
  console.log(
    "inject-analytics-endpoint: FORM_ANALYTICS_WORKER_URL unset; index.html unchanged.",
  );
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(urlRaw);
} catch {
  console.error("inject-analytics-endpoint: invalid URL:", urlRaw);
  process.exit(1);
}
if (parsed.protocol !== "https:") {
  console.error("inject-analytics-endpoint: URL must use https");
  process.exit(1);
}

const normalized = parsed.href.replace(/\/$/, "");
let html = readFileSync(indexPath, "utf8");
const re = /data-analytics-endpoint="[^"]*"/;
if (!re.test(html)) {
  console.error(
    "inject-analytics-endpoint: data-analytics-endpoint attribute not found in public/index.html",
  );
  process.exit(1);
}

const next = html.replace(re, `data-analytics-endpoint="${normalized}"`);
writeFileSync(indexPath, next, "utf8");
console.log("inject-analytics-endpoint: wrote", normalized);
