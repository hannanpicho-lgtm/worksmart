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
  const closeoutArgs = [];
  if (args.from) closeoutArgs.push(`--from=${args.from}`);
  if (args.to) closeoutArgs.push(`--to=${args.to}`);
  if (args.limit) closeoutArgs.push(`--limit=${args.limit}`);
  if (args.timeoutMs) closeoutArgs.push(`--timeout-ms=${args.timeoutMs}`);
  if (args.intervalMs) closeoutArgs.push(`--interval-ms=${args.intervalMs}`);
  if (args.skipWatch) closeoutArgs.push("--skip-watch");

  process.stdout.write("[release:finalize] running closeout...\n");
  runOrThrow("scripts/release-closeout.mjs", closeoutArgs);

  process.stdout.write("[release:finalize] generating handoff snapshot...\n");
  runOrThrow("scripts/release-handoff.mjs", []);
  process.stdout.write("[release:finalize] complete.\n");
}

main();
