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
    skipWatch: false,
    watchTimeoutMs: "600000",
    watchIntervalMs: "15000",
    startNext: false,
    nextName: "",
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
    if (k === "skip-watch") out.skipWatch = true;
    if (k === "watch-timeout-ms" && v) out.watchTimeoutMs = v;
    if (k === "watch-interval-ms" && v) out.watchIntervalMs = v;
    if (k === "start-next") out.startNext = true;
    if (k === "next-name" && v) out.nextName = v;
  }
  return out;
}

function defaultNextBranchName() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `phase/${yyyy}${mm}${dd}-${hh}${mi}-next`;
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
  if (args.startNext && args.noMerge && !args.dryRun) {
    throw new Error("Cannot use --start-next together with --no-merge in non-dry runs.");
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

  if (args.dryRun) {
    if (!args.noMerge && !args.skipWatch) {
      process.stdout.write(
        `[phase:autopilot] dry-run next step: npm run ops:watch -- --timeout-ms=${args.watchTimeoutMs} --interval-ms=${args.watchIntervalMs}\n`,
      );
    }
    if (args.startNext) {
      const branchName = args.nextName || defaultNextBranchName();
      process.stdout.write(
        `[phase:autopilot] dry-run next step: npm run phase:start -- --name=${branchName} --remote=${args.remote} --base=${args.base}\n`,
      );
    }
    return;
  }

  if (args.noMerge) {
    return;
  }

  if (!args.skipWatch) {
    const watchResult = runNpm([
      "run",
      "ops:watch",
      "--",
      `--timeout-ms=${args.watchTimeoutMs}`,
      `--interval-ms=${args.watchIntervalMs}`,
    ]);
    printOutput(watchResult);
    if ((watchResult.status ?? 1) !== 0) {
      throw new Error("ops:watch failed after phase closeout.");
    }
  }

  if (args.startNext) {
    const branchName = args.nextName || defaultNextBranchName();
    const nextResult = runNpm([
      "run",
      "phase:start",
      "--",
      `--name=${branchName}`,
      `--remote=${args.remote}`,
      `--base=${args.base}`,
    ]);
    printOutput(nextResult);
    if ((nextResult.status ?? 1) !== 0) {
      throw new Error("phase:start failed while creating next phase branch.");
    }
  }
}

main();
