#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function main() {
  const ts = stamp();
  const logsDir = resolve(process.cwd(), "logs");
  mkdirSync(logsDir, { recursive: true });

  const opsJsonPath = resolve(logsDir, `ops-status-${ts}.json`);
  const incidentPath = resolve(logsDir, `incident-template-${ts}.md`);
  const summaryPath = resolve(logsDir, `ops-evidence-${ts}.txt`);

  const opsJson = run("node scripts/ops-status.mjs --json");
  writeFileSync(opsJsonPath, `${opsJson}\n`);

  const incident = run("node scripts/ops-incident-template.mjs");
  writeFileSync(incidentPath, `${incident}\n`);

  const lines = [
    "WorkSmart Ops Evidence Snapshot",
    `captured_at_utc=${new Date().toISOString()}`,
    `ops_status_json=${opsJsonPath}`,
    `incident_template_md=${incidentPath}`,
  ];
  writeFileSync(summaryPath, `${lines.join("\n")}\n`);

  console.log(`Saved evidence summary: ${summaryPath}`);
  console.log(`Saved ops status JSON: ${opsJsonPath}`);
  console.log(`Saved incident template: ${incidentPath}`);
}

main();
