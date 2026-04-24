import { run } from "./exec.mjs";

export function git(...args) {
  return run("git", args);
}

export function currentBranch() {
  return git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
}

export function workingTreeDirty() {
  return git("status", "--porcelain").stdout.trim().length > 0;
}

export function changedFiles() {
  return git("status", "--porcelain")
    .stdout.split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
}

export function remoteUrl() {
  return git("remote", "get-url", "origin").stdout.trim();
}

export function headSha(ref = "HEAD") {
  return git("rev-parse", ref).stdout.trim();
}

export function hasDiffStagedOrUnstaged() {
  const unstaged = run("git", ["diff", "--quiet"], { allowFailure: true });
  if (unstaged.status !== 0) return true;
  const staged = run("git", ["diff", "--cached", "--quiet"], { allowFailure: true });
  return staged.status !== 0;
}

