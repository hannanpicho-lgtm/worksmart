#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = {
    from: "",
    to: "",
    limit: "",
    timeoutMs: "",
    intervalMs: "",
    skipWatch: false,
  };

  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "from" && v) out.from = v;
    if (k === "to" && v) out.to = v;
    if (k === "limit" && v) out.limit = v;
    if (k === "timeout-ms" && v) out.timeoutMs = v;
    if (k === "interval-ms" && v) out.intervalMs = v;
    if (k === "skip-watch") out.skipWatch = true;
  }

  return out;
}

function runOrThrow(scriptPath, args = []) {
  const result = spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(`${scriptPath} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const bundleArgs = [];
  if (args.from) bundleArgs.push(`--from=${args.from}`);
  if (args.to) bundleArgs.push(`--to=${args.to}`);
  if (args.limit) bundleArgs.push(`--limit=${args.limit}`);

  process.stdout.write("[release:closeout] capturing release bundle...\n");
  runOrThrow("scripts/release-bundle.mjs", bundleArgs);

  if (args.skipWatch) {
    process.stdout.write("[release:closeout] skip-watch enabled; post-merge watch not run.\n");
    return;
  }

  const watchArgs = [];
  if (args.timeoutMs) watchArgs.push(`--timeout-ms=${args.timeoutMs}`);
  if (args.intervalMs) watchArgs.push(`--interval-ms=${args.intervalMs}`);

  process.stdout.write("[release:closeout] watching post-merge checks...\n");
  runOrThrow("scripts/ops-watch.mjs", watchArgs);
  process.stdout.write("[release:closeout] complete.\n");
}

main();
