#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return result;
}

function runGitOrThrow(args) {
  const result = runGit(args);
  if (result.status !== 0) {
    const msg = String(result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim();
    throw new Error(msg);
  }
  return String(result.stdout || "").trim();
}

function parseArgs(argv) {
  const out = {
    remote: "origin",
    baseBranch: "main",
    name: "",
    dryRun: false,
  };

  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "remote" && v) out.remote = v;
    if (k === "base" && v) out.baseBranch = v;
    if (k === "name" && v) out.name = v;
    if (k === "dry-run") out.dryRun = true;
  }

  return out;
}

function defaultBranchName() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `phase/${yyyy}${mm}${dd}-${hh}${mi}`;
}

function ensureCleanWorkingTree() {
  const status = runGitOrThrow(["status", "--porcelain"]);
  if (status) {
    throw new Error(
      "Working tree is not clean. Commit or stash changes before starting a fresh phase branch.",
    );
  }
}

function ensureBranchMissing(branchName) {
  const result = runGit(["show-ref", "--verify", `refs/heads/${branchName}`]);
  if (result.status === 0) {
    throw new Error(`Local branch "${branchName}" already exists. Choose a different --name.`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const branchName = args.name || defaultBranchName();
  const baseRef = `${args.remote}/${args.baseBranch}`;

  if (args.dryRun) {
    process.stdout.write(
      [
        "phase:start dry run",
        `- remote: ${args.remote}`,
        `- base: ${baseRef}`,
        `- new_branch: ${branchName}`,
        "- next: git checkout -b <new_branch> <remote>/<base>",
      ].join("\n") + "\n",
    );
    return;
  }

  ensureCleanWorkingTree();
  ensureBranchMissing(branchName);
  runGitOrThrow(["fetch", args.remote, args.baseBranch]);

  runGitOrThrow(["checkout", "-b", branchName, baseRef]);
  process.stdout.write(
    [
      "phase:start created branch successfully",
      `- new_branch: ${branchName}`,
      `- based_on: ${baseRef}`,
      "- recommendation: make one focused phase change, then run pipeline:sync",
    ].join("\n") + "\n",
  );
}

main();
