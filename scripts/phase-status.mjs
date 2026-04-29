#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  return {
    full: argv.includes("--full"),
  };
}

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function summarizeReadiness(output) {
  const lines = output.split(/\r?\n/);
  const summary = {
    required_pass: 0,
    required_fail: 0,
    optional_fail: 0,
    final: "unknown",
  };

  for (const line of lines) {
    if (line.startsWith("[PASS]")) {
      if (line.includes("(optional)")) continue;
      summary.required_pass += 1;
    } else if (line.startsWith("[FAIL]")) {
      if (line.includes("(optional)")) summary.optional_fail += 1;
      else summary.required_fail += 1;
    } else if (line.startsWith("Readiness passed")) {
      summary.final = "passed";
    } else if (line.startsWith("Readiness failed")) {
      summary.final = "failed";
    }
  }

  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const readiness = runNodeScript("scripts/readiness-report.mjs");
  const latest = runNodeScript("scripts/release-latest.mjs");
  const readSummary = summarizeReadiness(`${readiness.stdout}\n${readiness.stderr}`);

  const lines = [
    "Phase status:",
    `- readiness: ${readSummary.final}`,
    `- required_checks: pass=${readSummary.required_pass} fail=${readSummary.required_fail}`,
    `- optional_failures: ${readSummary.optional_fail}`,
    `- release_latest: ${latest.status === 0 ? "ok" : "failed"}`,
  ];

  const latestFirstLine = latest.stdout.split(/\r?\n/).find((line) => line.startsWith("Release latest:"));
  if (latestFirstLine) {
    lines.push(`- release_latest_note: ${latestFirstLine}`);
  }

  console.log(lines.join("\n"));

  if (args.full) {
    console.log("\n--- readiness-report output ---");
    process.stdout.write(readiness.stdout);
    process.stdout.write(readiness.stderr);
    console.log("\n--- release-latest output ---");
    process.stdout.write(latest.stdout);
    process.stdout.write(latest.stderr);
  }

  if (readiness.status !== 0) {
    process.exit(readiness.status);
  }
}

main();
