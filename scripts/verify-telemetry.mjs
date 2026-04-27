#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readConfig() {
  return JSON.parse(readFileSync(resolve(process.cwd(), "pipeline.config.json"), "utf8"));
}

function extractAnalyticsEndpoint(html) {
  const m = html.match(/data-analytics-endpoint="([^"]*)"/i);
  return (m?.[1] || "").trim();
}

function resolveIngestUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (!u.pathname || u.pathname === "/") u.pathname = "/ingest";
    return u.toString();
  } catch {
    return "";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, init, label, attempts = 3, delayMs = 2000) {
  let lastErr = "";
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (i < attempts - 1) {
        console.error(
          `${label}: attempt ${i + 1}/${attempts} failed (${lastErr}); retry in ${delayMs}ms...`,
        );
        await sleep(delayMs);
      }
    }
  }
  throw new Error(`${label}: failed after ${attempts} attempts (${lastErr})`);
}

const cfg = readConfig();
const siteUrl = String(cfg?.deploy?.productionUrl || "").trim();
if (!siteUrl) {
  console.error("Missing deploy.productionUrl in pipeline.config.json");
  process.exit(1);
}

const pageRes = await fetchWithRetry(siteUrl, undefined, "Fetch production page", 4, 2500);
if (!pageRes.ok) {
  console.error(`Failed to fetch site: ${pageRes.status} ${pageRes.statusText}`);
  process.exit(1);
}

const html = await pageRes.text();
const endpoint = extractAnalyticsEndpoint(html);
if (!endpoint) {
  console.error("No data-analytics-endpoint found in live HTML (empty or missing).");
  process.exit(1);
}

const ingestUrl = resolveIngestUrl(endpoint);
if (!ingestUrl) {
  console.error(`Invalid data-analytics-endpoint value: ${endpoint}`);
  process.exit(1);
}

const origin = new URL(siteUrl).origin;
const payload = {
  event_name: "submit_attempt",
  timestamp: Date.now(),
  has_company: false,
  message_size: "short",
  page_path: "/",
};

const headers = {
  "Content-Type": "application/json",
  Origin: origin,
};
const secret = String(process.env.ANALYTICS_INGEST_SECRET || "").trim();
if (secret) headers.Authorization = `Bearer ${secret}`;

const preflightRes = await fetchWithRetry(
  ingestUrl,
  {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": secret ? "content-type,authorization" : "content-type",
    },
  },
  "Telemetry preflight",
  3,
  1500,
);

const ingestRes = await fetchWithRetry(ingestUrl, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
}, "Telemetry ingest", 3, 1500);

if (ingestRes.status !== 204) {
  const body = await ingestRes.text();
  console.error(`Telemetry ingest failed: ${ingestRes.status} ${ingestRes.statusText}`);
  console.error(`- site: ${siteUrl}`);
  console.error(`- endpoint: ${endpoint}`);
  console.error(`- ingest: ${ingestUrl}`);
  console.error(`- origin header sent: ${origin}`);
  console.error(
    `- preflight: ${preflightRes.status} ${preflightRes.statusText}; allow-origin=${preflightRes.headers.get("access-control-allow-origin") || "<none>"}`,
  );
  if (ingestRes.status === 403) {
    console.error(
      `Hint: set Worker ALLOWED_ORIGINS to include exactly: ${origin} (no trailing slash).`,
    );
  }
  if (body) console.error(body.slice(0, 400));
  process.exit(1);
}

console.log("Telemetry smoke passed.");
console.log(`- site: ${siteUrl}`);
console.log(`- endpoint: ${endpoint}`);
console.log(`- ingest: ${ingestUrl}`);
console.log(`- origin header: ${origin}`);
