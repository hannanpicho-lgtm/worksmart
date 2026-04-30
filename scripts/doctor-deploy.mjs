#!/usr/bin/env node

import { loadEnvFile } from "./lib/env-file.mjs";

loadEnvFile(".env.pipeline");

const requiredVars = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_PROJECT_NAME",
];

const missing = requiredVars.filter((name) => String(process.env[name] || "").trim().length === 0);

if (missing.length > 0) {
  console.log("Deploy environment check failed.");
  console.log("Missing required variable(s):");
  for (const name of missing) {
    console.log(`- ${name}`);
  }
  console.log("");
  console.log(
    "Set these for the current shell (or your local environment) before running deploy commands.",
  );
  console.log("See .env.pipeline.example and deployment setup docs for expected names.");
  process.exit(1);
}

console.log("Deploy environment check passed.");
for (const name of requiredVars) {
  console.log(`- ${name}: ok`);
}
