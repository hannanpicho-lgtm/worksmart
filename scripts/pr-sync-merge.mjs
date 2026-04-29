#!/usr/bin/env node

import { run } from "./lib/exec.mjs";
import { currentBranch, remoteUrl, workingTreeDirty } from "./lib/git.mjs";
import { parseGitHubRepo, upsertPr, mergePr } from "./lib/github.mjs";
import { loadEnvFile } from "./lib/env-file.mjs";

function parseArgs(argv) {
  const out = {
    remote: "origin",
    base: "main",
    dryRun: false,
    noMerge: false,
    title: "",
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "remote" && v) out.remote = v;
    if (k === "base" && v) out.base = v;
    if (k === "title" && v) out.title = v;
    if (k === "dry-run") out.dryRun = true;
    if (k === "no-merge") out.noMerge = true;
  }
  return out;
}

function git(...args) {
  return run("git", args).stdout.trim();
}

function gitAllowFailure(...args) {
  return run("git", args, { allowFailure: true });
}

function branchNeedsSync(baseRef) {
  const res = gitAllowFailure("merge-base", "--is-ancestor", baseRef, "HEAD");
  return res.status !== 0;
}

function latestSubject() {
  return git("log", "-1", "--pretty=%s");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(".env.pipeline");

  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw new Error("Missing GITHUB_TOKEN. Set it in environment or .env.pipeline.");

  const branch = currentBranch();
  if (!branch || branch === args.base) {
    throw new Error(`Current branch "${branch}" is not valid for PR merge automation.`);
  }
  const baseRef = `${args.remote}/${args.base}`;
  const repoInfo = parseGitHubRepo(remoteUrl());
  const title = args.title || latestSubject();
  const body = [
    "## Summary",
    "- auto-sync branch with latest base before PR merge attempt",
    "- create or update PR from current branch",
    args.noMerge ? "- leave PR open (`--no-merge` enabled)" : "- merge PR automatically when mergeable",
    "",
    "## Test plan",
    "- [x] automated sync + PR flow",
  ].join("\n");

  if (args.dryRun) {
    process.stdout.write(
      [
        "pr:sync-merge dry run",
        `- branch: ${branch}`,
        `- base: ${baseRef}`,
        `- title: ${title}`,
        `- action: fetch base, merge when needed, push, upsert PR${args.noMerge ? ", no merge" : ", merge"}`,
      ].join("\n") + "\n",
    );
    return;
  }

  if (workingTreeDirty()) {
    throw new Error("Working tree is dirty. Commit or stash changes before running pr:sync-merge.");
  }

  git("fetch", args.remote, args.base);
  if (branchNeedsSync(baseRef)) {
    process.stdout.write(`Syncing ${branch} with ${baseRef}...\n`);
    git("merge", baseRef);
  } else {
    process.stdout.write(`${branch} already contains ${baseRef}.\n`);
  }

  git("push");
  const pr = await upsertPr({
    token,
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    headBranch: branch,
    baseBranch: args.base,
    title,
    body,
  });
  process.stdout.write(`PR_URL=${pr.html_url}\n`);

  if (!args.noMerge) {
    await mergePr({
      token,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      pullNumber: pr.number,
      method: "squash",
    });
    process.stdout.write(`PR_MERGED=${pr.number}\n`);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
