#!/usr/bin/env node

import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

let statusJson = "";
try {
  statusJson = run("node scripts/ops-status.mjs --json");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ops:incident-template failed to collect status: ${msg}`);
  process.exit(1);
}

let snapshot;
try {
  snapshot = JSON.parse(statusJson);
} catch {
  console.error("ops:incident-template failed to parse ops status JSON.");
  process.exit(1);
}

const failedWorkflows = (snapshot.workflows || []).filter(
  (w) => w.available && w.conclusion && w.conclusion !== "success",
);

const lines = [
  "# Incident Template",
  "",
  `- Time (UTC): ${new Date().toISOString()}`,
  `- Repo: ${snapshot.repo || "unknown"}`,
  `- Production URL: ${snapshot.pages?.url || "unknown"}`,
  `- Pages health: ${snapshot.pages?.status || "?"} ${snapshot.pages?.status_text || ""}`.trim(),
  snapshot.worker_health?.skipped
    ? `- Worker health: skipped (${snapshot.worker_health.reason})`
    : `- Worker health: ${snapshot.worker_health?.status || "?"} ${
        snapshot.worker_health?.ok ? "ok" : "not-ok"
      } (${snapshot.worker_health?.url || "unknown"})`,
  "",
  "## Current failing workflows",
];

if (failedWorkflows.length === 0) {
  lines.push("- none (all latest tracked workflows succeeded)");
} else {
  for (const wf of failedWorkflows) {
    lines.push(`- ${wf.label}: ${wf.status}/${wf.conclusion} (${wf.html_url})`);
  }
}

lines.push(
  "",
  "## Impact",
  "- [describe user-facing impact]",
  "",
  "## Suspected cause",
  "- [first hypothesis]",
  "",
  "## Immediate actions taken",
  "- [what you changed/restarted/reran]",
  "",
  "## Verification",
  "- `npm run ops:status`",
  "- `npm run verify:prod`",
  "- `npm run verify:telemetry` (if configured)",
  "",
  "## Follow-up actions",
  "- [preventive fix]",
);

console.log(lines.join("\n"));
