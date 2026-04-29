#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    clusterRelease: false,
    clusterAll: false,
    releaseFrom: "",
    releaseTo: "",
    releaseLimit: "",
    releaseSkipWatch: false,
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
    if (k === "cluster-release") out.clusterRelease = true;
    if (k === "cluster-all") out.clusterAll = true;
    if (k === "release-from" && v) out.releaseFrom = v;
    if (k === "release-to" && v) out.releaseTo = v;
    if (k === "release-limit" && v) out.releaseLimit = v;
    if (k === "release-skip-watch") out.releaseSkipWatch = true;
  }
  return out;
}

function inferNextPhaseNumber() {
  const phasePath = resolve(process.cwd(), "PHASE.md");
  if (!existsSync(phasePath)) return null;
  const text = readFileSync(phasePath, "utf8");
  const matches = [...text.matchAll(/##\s+Phase\s+(\d+)\s+—/g)];
  if (matches.length === 0) return null;
  const numbers = matches
    .map((m) => Number.parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numbers.length === 0) return null;
  return Math.max(...numbers) + 1;
}

function defaultNextBranchName() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const nextPhase = inferNextPhaseNumber();
  if (nextPhase) {
    return `phase/${nextPhase}-${yyyy}${mm}${dd}-${hh}${mi}`;
  }
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
  if (args.clusterAll) {
    args.clusterRelease = true;
    args.startNext = true;
  }

  if (!args.message) {
    throw new Error("Missing commit message. Use --message=<text>.");
  }
  if ((args.startNext || args.clusterRelease) && args.noMerge && !args.dryRun) {
    throw new Error(
      "Cannot use --no-merge with --start-next/--cluster-release in non-dry runs.",
    );
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
    if (args.clusterRelease) {
      const releaseArgs = [];
      if (args.releaseFrom) releaseArgs.push(`--from=${args.releaseFrom}`);
      if (args.releaseTo) releaseArgs.push(`--to=${args.releaseTo}`);
      if (args.releaseLimit) releaseArgs.push(`--limit=${args.releaseLimit}`);
      if (args.releaseSkipWatch) releaseArgs.push("--skip-watch");
      const suffix = releaseArgs.length ? ` -- ${releaseArgs.join(" ")}` : "";
      process.stdout.write(
        `[phase:autopilot] dry-run next step: npm run release:finalize${suffix}\n`,
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

  if (args.clusterRelease) {
    const releaseArgs = ["run", "release:finalize"];
    const releaseFlags = [];
    if (args.releaseFrom) releaseFlags.push(`--from=${args.releaseFrom}`);
    if (args.releaseTo) releaseFlags.push(`--to=${args.releaseTo}`);
    if (args.releaseLimit) releaseFlags.push(`--limit=${args.releaseLimit}`);
    if (args.releaseSkipWatch) releaseFlags.push("--skip-watch");
    if (releaseFlags.length > 0) {
      releaseArgs.push("--", ...releaseFlags);
    }
    const releaseResult = runNpm(releaseArgs);
    printOutput(releaseResult);
    if ((releaseResult.status ?? 1) !== 0) {
      throw new Error("release:finalize failed during clustered phase closeout.");
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
