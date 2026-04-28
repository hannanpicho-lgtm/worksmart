#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function parseArgs(argv) {
  const out = {
    from: "",
    to: "HEAD",
    limit: "",
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "from" && v) out.from = v;
    if (k === "to" && v) out.to = v;
    if (k === "limit" && v) out.limit = v;
  }
  return out;
}

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ts = stamp();
  const logsDir = resolve(process.cwd(), "logs");
  mkdirSync(logsDir, { recursive: true });

  const notesPath = resolve(logsDir, `release-notes-${ts}.md`);
  const opsPath = resolve(logsDir, `ops-status-${ts}.json`);
  const incidentPath = resolve(logsDir, `incident-template-${ts}.md`);
  const summaryPath = resolve(logsDir, `release-bundle-${ts}.txt`);

  const noteCmd = args.from
    ? `node scripts/release-notes.mjs --from=${args.from} --to=${args.to}`
    : `node scripts/release-notes.mjs --to=${args.to}${args.limit ? ` --limit=${args.limit}` : ""}`;
  const releaseNotes = run(noteCmd);
  writeFileSync(notesPath, `${releaseNotes}\n`);

  const opsStatus = run("node scripts/ops-status.mjs --json");
  writeFileSync(opsPath, `${opsStatus}\n`);

  const incidentTemplate = run("node scripts/ops-incident-template.mjs");
  writeFileSync(incidentPath, `${incidentTemplate}\n`);

  const summary = [
    "WorkSmart Release Bundle",
    `captured_at_utc=${new Date().toISOString()}`,
    `release_notes_md=${notesPath}`,
    `ops_status_json=${opsPath}`,
    `incident_template_md=${incidentPath}`,
  ].join("\n");
  writeFileSync(summaryPath, `${summary}\n`);

  console.log(`Saved bundle summary: ${summaryPath}`);
  console.log(`Saved release notes: ${notesPath}`);
  console.log(`Saved ops status: ${opsPath}`);
  console.log(`Saved incident template: ${incidentPath}`);
}

main();
