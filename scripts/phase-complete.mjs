#!/usr/bin/env node

import { run } from "./lib/exec.mjs";
import { currentBranch, workingTreeDirty } from "./lib/git.mjs";

function parseArgs(argv) {
  const out = {
    message: "",
    title: "",
    base: "main",
    remote: "origin",
    skipTest: false,
    noMerge: false,
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
    if (k === "dry-run") out.dryRun = true;
  }
  return out;
}

function runStep(command, args, opts = {}) {
  const pretty = `${command} ${args.join(" ")}`.trim();
  if (!opts.quiet) process.stdout.write(`[phase:complete] ${pretty}\n`);
  return run(command, args, opts);
}

function requireCommitMessage(msg) {
  if (!msg.trim()) {
    throw new Error("Missing commit message. Use --message=<text>.");
  }
}

function commitIfNeeded(message) {
  const diffStatus = run("git", ["status", "--porcelain"]).stdout.trim();
  if (!diffStatus) {
    process.stdout.write("[phase:complete] no changes to commit.\n");
    return false;
  }
  runStep("git", ["add", "-A"]);
  runStep("git", ["commit", "-m", message]);
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const branch = currentBranch();
  if (!branch || branch === args.base) {
    throw new Error(`Current branch "${branch}" is not valid for phase completion.`);
  }

  requireCommitMessage(args.message);

  if (args.dryRun) {
    process.stdout.write(
      [
        "phase:complete dry run",
        `- branch: ${branch}`,
        `- commit_message: ${args.message}`,
        `- test: ${args.skipTest ? "skipped" : "npm test"}`,
        `- pr_sync_merge: npm run pr:sync-merge -- --remote=${args.remote} --base=${args.base}${
          args.title ? ` --title=${args.title}` : ""
        }${args.noMerge ? " --no-merge" : ""}`,
      ].join("\n") + "\n",
    );
    return;
  }

  if (!args.skipTest) {
    runStep("npm", ["test"]);
  }

  const committed = commitIfNeeded(args.message);
  if (!committed && !workingTreeDirty()) {
    process.stdout.write("[phase:complete] proceeding without new commit.\n");
  }

  runStep("git", ["push"]);

  const prArgs = [
    "run",
    "pr:sync-merge",
    "--",
    `--remote=${args.remote}`,
    `--base=${args.base}`,
  ];
  if (args.title) prArgs.push(`--title=${args.title}`);
  if (args.noMerge) prArgs.push("--no-merge");
  runStep("npm", prArgs);
}

main();
