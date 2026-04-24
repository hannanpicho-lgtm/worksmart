#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = JSON.parse(readFileSync(resolve(process.cwd(), "pipeline.config.json"), "utf8"));
const targetUrl = config?.deploy?.productionUrl;
const markers = config?.deploy?.verifyContains ?? [];

if (!targetUrl) {
  console.error("Missing deploy.productionUrl in pipeline.config.json");
  process.exit(1);
}

const res = await fetch(targetUrl);
if (!res.ok) {
  console.error(`Failed to fetch ${targetUrl}: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const html = await res.text();
const missing = markers.filter((marker) => !html.includes(marker));

if (missing.length > 0) {
  console.error("Production verification failed. Missing markers:");
  missing.forEach((m) => console.error(` - ${m}`));
  process.exit(1);
}

console.log(`Production verification passed at ${targetUrl}`);
