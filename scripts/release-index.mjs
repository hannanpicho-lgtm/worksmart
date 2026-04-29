#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parseLimit(argv) {
  for (const raw of argv) {
    if (!raw.startsWith("--limit=")) continue;
    const n = Number.parseInt(raw.slice("--limit=".length), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 20;
}

function parseSummaryFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const item = {
    summary_file: filePath,
    captured_at_utc: "",
    release_notes_md: "",
    ops_status_json: "",
    incident_template_md: "",
  };

  for (const line of lines) {
    if (line.startsWith("captured_at_utc=")) item.captured_at_utc = line.slice("captured_at_utc=".length);
    if (line.startsWith("release_notes_md="))
      item.release_notes_md = line.slice("release_notes_md=".length);
    if (line.startsWith("ops_status_json=")) item.ops_status_json = line.slice("ops_status_json=".length);
    if (line.startsWith("incident_template_md="))
      item.incident_template_md = line.slice("incident_template_md=".length);
  }

  return item;
}

function main() {
  const limit = parseLimit(process.argv.slice(2));
  const logsDir = resolve(process.cwd(), "logs");
  if (!existsSync(logsDir)) {
    throw new Error("logs directory does not exist yet. Run release:bundle first.");
  }

  const files = readdirSync(logsDir)
    .filter((name) => /^release-bundle-.*\.txt$/i.test(name))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  const bundles = files.map((name) => parseSummaryFile(resolve(logsDir, name)));
  const out = {
    generated_at_utc: new Date().toISOString(),
    total_bundles_indexed: bundles.length,
    bundles,
  };

  const outPath = resolve(logsDir, "release-index.json");
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Saved release index: ${outPath}`);
}

main();
