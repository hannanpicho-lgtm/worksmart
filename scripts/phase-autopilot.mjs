#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = {
    message: "",
    title: "",
    base: "main",
    remote: "origin",
    skipTest: false,
    noMerge: false,
    force: false,
    fullStatus: false,
    dryRun: false,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "message" && v) out.message = v;
    if (k === "title" && v) out.title = v;
    if (k === "base" && v) out.base = v;
    if (k === "remote" && v) out.remote = v;
    if (k === "skip-test") out.skipTest = true;
    if (k === "no-merge") out.noMerge = true;
    if (k === "force") out.force = true;
    if (k === "full-status") out.fullStatus = true;
    if (k === "dry-run") out.dryRun = true;
  }
  return out;
}

function runNodeScript(scriptPath, args = []) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runNpm(args = []) {
  return spawnSync("npm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
}

function printOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.message) {
    throw new Error("Missing commit message. Use --message=<text>.");
  }

  const statusArgs = [];
  if (args.fullStatus) statusArgs.push("--full");
  const statusResult = runNodeScript("scripts/phase-status.mjs", statusArgs);
  printOutput(statusResult);

  if (statusResult.status !== 0 && !args.force && !args.dryRun) {
    throw new Error(
      "phase:status is not green. Fix required readiness failures or rerun with --force to continue.",
    );
  }

  const completeArgs = [
    "run",
    "phase:complete",
    "--",
    `--message=${args.message}`,
    `--remote=${args.remote}`,
    `--base=${args.base}`,
  ];
  if (args.title) completeArgs.push(`--title=${args.title}`);
  if (args.skipTest) completeArgs.push("--skip-test");
  if (args.noMerge) completeArgs.push("--no-merge");
  if (args.dryRun) completeArgs.push("--dry-run");

  const completeResult = runNpm(completeArgs);
  printOutput(completeResult);
  if ((completeResult.status ?? 1) !== 0) {
    throw new Error("phase:complete failed.");
  }
}

main();
