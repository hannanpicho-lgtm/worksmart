#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    ensureUnique: true,
  };

  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "remote" && v) out.remote = v;
    if (k === "base" && v) out.baseBranch = v;
    if (k === "name" && v) out.name = v;
    if (k === "dry-run") out.dryRun = true;
    if (k === "ensure-unique") out.ensureUnique = true;
    if (k === "no-ensure-unique") out.ensureUnique = false;
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

function defaultBranchName() {
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

function branchExists(branchName, remote) {
  const local = runGit(["show-ref", "--verify", `refs/heads/${branchName}`]).status === 0;
  const remoteRef = runGit(["show-ref", "--verify", `refs/remotes/${remote}/${branchName}`]).status === 0;
  return local || remoteRef;
}

function ensureBranchMissing(branchName, remote) {
  if (branchExists(branchName, remote)) {
    throw new Error(
      `Branch "${branchName}" already exists locally or on ${remote}. Choose a different --name or use --ensure-unique.`,
    );
  }
}

function resolveUniqueBranchName(branchName, remote) {
  if (!branchExists(branchName, remote)) return branchName;
  for (let i = 2; i <= 200; i += 1) {
    const candidate = `${branchName}-${i}`;
    if (!branchExists(candidate, remote)) return candidate;
  }
  throw new Error(`Could not find unique branch name for base "${branchName}" after 199 attempts.`);
}

function printSuccess(branchName, baseRef) {
  process.stdout.write(
    [
      "phase:start created branch successfully",
      `- new_branch: ${branchName}`,
      `- based_on: ${baseRef}`,
      "- recommendation: make one focused phase change, then run pipeline:sync",
    ].join("\n") + "\n",
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestedBranchName = args.name || defaultBranchName();
  const baseRef = `${args.remote}/${args.baseBranch}`;

  if (args.dryRun) {
    process.stdout.write(
      [
        "phase:start dry run",
        `- remote: ${args.remote}`,
        `- base: ${baseRef}`,
        `- requested_branch: ${requestedBranchName}`,
        `- ensure_unique: ${String(args.ensureUnique)}`,
        "- next: git checkout -b <new_branch> <remote>/<base>",
      ].join("\n") + "\n",
    );
    return;
  }

  ensureCleanWorkingTree();
  runGitOrThrow(["fetch", args.remote, args.baseBranch]);
  runGitOrThrow(["fetch", args.remote]);

  const branchName = args.ensureUnique
    ? resolveUniqueBranchName(requestedBranchName, args.remote)
    : requestedBranchName;

  if (!args.ensureUnique) {
    ensureBranchMissing(branchName, args.remote);
  }

  runGitOrThrow(["checkout", "-b", branchName, baseRef]);
  printSuccess(branchName, baseRef);
}

main();
