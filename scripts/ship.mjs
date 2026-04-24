#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const args = new Set(process.argv.slice(2));
const quickMode = args.has("--quick");
const skipChecks = args.has("--no-check");
const openPrUrl = args.has("--open");
const allowMain = args.has("--allow-main");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    shell: false,
  });

  if (options.allowFailure) {
    return result;
  }

  if (result.status !== 0) {
    const message =
      result.stderr?.trim() ||
      result.stdout?.trim() ||
      `Command failed with exit code ${result.status ?? "unknown"}.`;
    throw new Error(`${command} ${commandArgs.join(" ")}\n${message}`);
  }

  return result;
}

function git(...commandArgs) {
  return run("git", commandArgs);
}

function npmRun(scriptName) {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(cmd, ["run", scriptName], { stdio: "inherit" });
}

function getBranchName() {
  return git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
}

function getDirtyFiles() {
  const outputText = git("status", "--porcelain").stdout;
  return outputText
    .split("\n")
    .map((line) => line)
    .filter(Boolean)
    .map((line) => line.slice(3));
}

function getRemoteUrl() {
  const result = git("remote", "get-url", "origin");
  return result.stdout.trim();
}

function getCompareUrl(remoteUrl, branchName) {
  // Support HTTPS and SSH GitHub remotes.
  if (remoteUrl.startsWith("git@github.com:")) {
    const repoPath = remoteUrl.replace("git@github.com:", "").replace(/\.git$/, "");
    return `https://github.com/${repoPath}/compare/main...${branchName}?expand=1`;
  }
  if (remoteUrl.startsWith("https://github.com/")) {
    const repoPath = remoteUrl.replace("https://github.com/", "").replace(/\.git$/, "");
    return `https://github.com/${repoPath}/compare/main...${branchName}?expand=1`;
  }
  return "";
}

function printBanner(text) {
  output.write(`\n=== ${text} ===\n`);
}

async function askCommitMessage(defaultMessage) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `Commit message [default: "${defaultMessage}"]: `,
    );
    return answer.trim() || defaultMessage;
  } finally {
    rl.close();
  }
}

function inferDefaultMessage(changedFiles) {
  const hasDocsOnly = changedFiles.every((file) =>
    [".md", ".yml", ".yaml"].some((ext) => file.endsWith(ext)),
  );
  if (hasDocsOnly) return "docs: update project documentation";
  return "chore: update project changes";
}

function maybeOpenUrl(url) {
  if (!url) return;

  if (process.platform === "win32") {
    run("cmd", ["/c", "start", "", url], { allowFailure: true });
    return;
  }
  if (process.platform === "darwin") {
    run("open", [url], { allowFailure: true });
    return;
  }
  run("xdg-open", [url], { allowFailure: true });
}

async function main() {
  printBanner("Ship Assistant");
  const branchName = getBranchName();

  if (!allowMain && (branchName === "main" || branchName === "master")) {
    throw new Error(
      `Refusing to ship from "${branchName}". Create a feature branch first.\n` +
        "Use: git checkout -b feature/<name>",
    );
  }

  const changedFiles = getDirtyFiles();
  if (changedFiles.length === 0) {
    output.write("No local changes detected. Nothing to ship.\n");
    return;
  }

  output.write(`Branch: ${branchName}\n`);
  output.write(`Changed files (${changedFiles.length}):\n`);
  changedFiles.forEach((file) => output.write(` - ${file}\n`));

  if (!skipChecks) {
    printBanner("Running checks");
    npmRun("format:check");
  }

  printBanner("Creating commit");
  git("add", "-A");
  const commitMessage = quickMode
    ? inferDefaultMessage(changedFiles)
    : await askCommitMessage(inferDefaultMessage(changedFiles));

  run("git", ["commit", "-m", commitMessage], { stdio: "inherit" });

  printBanner("Pushing branch");
  run("git", ["push", "-u", "origin", branchName], { stdio: "inherit" });

  const compareUrl = getCompareUrl(getRemoteUrl(), branchName);
  if (compareUrl) {
    output.write(`\nOpen PR:\n${compareUrl}\n`);
    if (openPrUrl) {
      maybeOpenUrl(compareUrl);
    }
  }

  output.write("\nDone. Review changes, then create and merge the PR.\n");
}

main().catch((error) => {
  output.write(`\nShip failed:\n${error.message}\n`);
  process.exit(1);
});
