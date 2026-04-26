#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = JSON.parse(readFileSync(resolve(process.cwd(), "pipeline.config.json"), "utf8"));
const targetUrl = config?.deploy?.productionUrl;
const markers = config?.deploy?.verifyContains ?? [];
const rawHealth = config?.workers?.formAnalytics?.verifyHealthUrl;
const workerHealthUrl = typeof rawHealth === "string" ? rawHealth.trim() : "";
const attempts = Math.max(1, Number(config?.deploy?.verifyFetchAttempts) || 3);
const delayMs = Math.max(0, Number(config?.deploy?.verifyRetryDelayMs) || 5000);

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchOk(url, label) {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastErr = `${res.status} ${res.statusText}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    if (i < attempts - 1) {
      process.stdout.write(
        `${label}: attempt ${i + 1}/${attempts} failed (${lastErr}), retry in ${delayMs}ms…\n`,
      );
      await sleep(delayMs);
    }
  }
  throw new Error(`${label}: failed after ${attempts} attempts (${lastErr})`);
}

if (!targetUrl) {
  console.error("Missing deploy.productionUrl in pipeline.config.json");
  process.exit(1);
}

const res = await fetchOk(targetUrl, "Pages");
const html = await res.text();
const missing = markers.filter((marker) => !html.includes(marker));

if (missing.length > 0) {
  console.error("Production verification failed. Missing markers:");
  missing.forEach((m) => console.error(` - ${m}`));
  process.exit(1);
}

console.log(`Production verification passed at ${targetUrl}`);

if (workerHealthUrl) {
  const h = await fetchOk(workerHealthUrl, "Worker /health");
  const text = await h.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error("Worker health check: response is not JSON");
    process.exit(1);
  }
  if (body?.ok !== true) {
    console.error("Worker health check: expected { ok: true }, got:", text.slice(0, 200));
    process.exit(1);
  }
  console.log(`Worker health OK at ${workerHealthUrl}`);
}
