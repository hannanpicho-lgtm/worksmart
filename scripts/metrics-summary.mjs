#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const out = { days: 7, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") {
      out.json = true;
    } else if (a === "--days") {
      out.days = Number.parseInt(argv[i + 1] || "", 10);
      i += 1;
    } else if (a.startsWith("--days=")) {
      out.days = Number.parseInt(a.split("=")[1] || "", 10);
    } else if (a === "--url") {
      out.url = (argv[i + 1] || "").trim();
      i += 1;
    } else if (a.startsWith("--url=")) {
      out.url = a.split("=")[1]?.trim();
    }
  }
  if (!Number.isFinite(out.days)) out.days = 7;
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function baseUrlFromConfig() {
  try {
    const cfg = JSON.parse(readFileSync(resolve(process.cwd(), "pipeline.config.json"), "utf8"));
    const raw = cfg?.workers?.formAnalytics?.verifyHealthUrl;
    if (typeof raw !== "string" || !raw.trim()) return "";
    return raw.trim().replace(/\/health\/?$/i, "");
  } catch {
    return "";
  }
}

function pct(v) {
  return typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "n/a";
}

function printTable(rows) {
  if (!rows.length) {
    console.log("No per-day metrics returned.");
    return;
  }
  const headers = ["day", "attempt", "success", "error", "blocked"];
  const widths = headers.map((h) => h.length);
  for (const r of rows) {
    const values = [
      r.day,
      String(r.metrics.submit_attempt || 0),
      String(r.metrics.submit_success || 0),
      String(r.metrics.submit_error || 0),
      String(
        Object.entries(r.metrics).reduce(
          (n, [k, v]) => (k.startsWith("submit_blocked_") ? n + (Number(v) || 0) : n),
          0,
        ),
      ),
    ];
    values.forEach((v, i) => {
      widths[i] = Math.max(widths[i], v.length);
    });
  }
  const line = headers.map((h, i) => h.padEnd(widths[i])).join("  ");
  console.log(line);
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) {
    const blocked = Object.entries(r.metrics).reduce(
      (n, [k, v]) => (k.startsWith("submit_blocked_") ? n + (Number(v) || 0) : n),
      0,
    );
    const values = [
      r.day,
      String(r.metrics.submit_attempt || 0),
      String(r.metrics.submit_success || 0),
      String(r.metrics.submit_error || 0),
      String(blocked),
    ];
    console.log(values.map((v, i) => v.padEnd(widths[i])).join("  "));
  }
}

const args = parseArgs(process.argv.slice(2));
const days = clampInt(args.days, 1, 30, 7);
const base = (args.url || process.env.FORM_ANALYTICS_WORKER_URL || baseUrlFromConfig() || "").replace(/\/$/, "");
const token = (process.env.ANALYTICS_INGEST_SECRET || "").trim();

if (!base) {
  console.error("Missing Worker URL. Set FORM_ANALYTICS_WORKER_URL, or pass --url, or set workers.formAnalytics.verifyHealthUrl in pipeline.config.json.");
  process.exit(1);
}
if (!token) {
  console.error("Missing ANALYTICS_INGEST_SECRET environment variable for read access.");
  process.exit(1);
}

const endpoint = `${base}/metrics-summary?token=${encodeURIComponent(token)}&days=${days}`;
const res = await fetch(endpoint);
if (!res.ok) {
  const text = await res.text();
  console.error(`Request failed: ${res.status} ${res.statusText}`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

const body = await res.json();
if (args.json) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

console.log(`Metrics summary (${body.days}d): ${body.range?.start || "?"} → ${body.range?.end || "?"}`);
printTable(Array.isArray(body.by_day) ? body.by_day : []);
console.log("\nRollup:");
for (const [k, v] of Object.entries(body.rollup || {}).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`- ${k}: ${v}`);
}
console.log("\nRates:");
console.log(`- attempts: ${body.rates?.submit_attempts ?? 0}`);
console.log(`- success: ${pct(body.rates?.success_rate)}`);
console.log(`- error:   ${pct(body.rates?.error_rate)}`);
console.log(`- blocked: ${pct(body.rates?.blocked_rate)}`);
