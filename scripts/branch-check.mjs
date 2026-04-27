#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = String(result.stderr || result.stdout || "git command failed").trim();
    throw new Error(err);
  }
  return String(result.stdout || "").trim();
}

function main() {
  const base = process.env.PIPELINE_BASE_BRANCH || "main";
  const remote = process.env.PIPELINE_REMOTE || "origin";
  const target = `${remote}/${base}`;

  try {
    runGit(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    console.error("Not a git repository.");
    process.exit(1);
  }

  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  runGit(["fetch", remote, base]);

  const behindRaw = runGit(["rev-list", "--count", `HEAD..${target}`]);
  const aheadRaw = runGit(["rev-list", "--count", `${target}..HEAD`]);
  const behind = Number.parseInt(behindRaw, 10) || 0;
  const ahead = Number.parseInt(aheadRaw, 10) || 0;

  console.log(`Branch sync report (${branch} vs ${target})`);
  console.log(`- ahead commits: ${ahead}`);
  console.log(`- behind commits: ${behind}`);

  if (behind > 0) {
    console.error(
      `Branch is behind ${target} by ${behind} commit(s). Sync with latest ${base} before pipeline to avoid merge conflicts.`,
    );
    process.exit(1);
  }

  console.log("Branch is up to date with base.");
}

main();
