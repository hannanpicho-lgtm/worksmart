#!/usr/bin/env node

function read(name) {
  return String(process.env[name] || "").trim();
}

function isLikelyUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

const checks = [
  { name: "GITHUB_TOKEN", required: true, note: "pipeline PR create/update + merge" },
  { name: "CLOUDFLARE_API_TOKEN", required: true, note: "Pages/Worker deploy auth" },
  { name: "CLOUDFLARE_ACCOUNT_ID", required: true, note: "Cloudflare account scope" },
  { name: "CLOUDFLARE_PROJECT_NAME", required: true, note: "Pages project name" },
  { name: "FORM_ANALYTICS_WORKER_URL", required: false, note: "inject + telemetry checks", url: true },
  { name: "ANALYTICS_INGEST_SECRET", required: false, note: "metrics read auth + telemetry auth" },
  { name: "SLACK_WEBHOOK_URL", required: false, note: "deploy/monitor failure alerts", url: true },
  { name: "SLACK_ALERT_COOLDOWN_MINUTES", required: false, note: "Slack alert dedupe cooldown" },
];

let missingRequired = 0;
let invalidValues = 0;

console.log("Environment doctor:");
for (const c of checks) {
  const value = read(c.name);
  const present = value.length > 0;
  if (!present && c.required) {
    missingRequired += 1;
    console.log(`- ${c.name}: MISSING (required) — ${c.note}`);
    continue;
  }
  if (!present) {
    console.log(`- ${c.name}: missing (optional) — ${c.note}`);
    continue;
  }
  if (c.url && !isLikelyUrl(value)) {
    invalidValues += 1;
    console.log(`- ${c.name}: INVALID (expected https URL)`);
    continue;
  }
  if (c.name === "CLOUDFLARE_ACCOUNT_ID" && !/^[a-f0-9]{32}$/i.test(value)) {
    invalidValues += 1;
    console.log(`- ${c.name}: INVALID (expected 32-char hex account id)`);
    continue;
  }
  if (c.name === "SLACK_ALERT_COOLDOWN_MINUTES") {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0 || n > 1440) {
      invalidValues += 1;
      console.log(`- ${c.name}: INVALID (expected integer 0..1440)`);
      continue;
    }
  }
  console.log(`- ${c.name}: ok`);
}

if (missingRequired > 0 || invalidValues > 0) {
  console.log(
    `\nDoctor failed: ${missingRequired} missing required, ${invalidValues} invalid value(s).`,
  );
  process.exit(1);
}

console.log("\nDoctor passed.");
