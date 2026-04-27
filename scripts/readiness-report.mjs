#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const cliArgs = new Set(process.argv.slice(2));

function stripOptionalQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(path) {
  const absPath = resolve(process.cwd(), path);
  if (!existsSync(absPath)) return { loaded: 0, path: absPath, found: false };

  const content = readFileSync(absPath, "utf8");
  const lines = content.split(/\r?\n/);
  let loaded = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const firstEquals = line.indexOf("=");
    if (firstEquals <= 0) continue;
    const key = line.slice(0, firstEquals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    const value = stripOptionalQuotes(line.slice(firstEquals + 1).trim());
    process.env[key] = value;
    loaded += 1;
  }

  return { loaded, path: absPath, found: true };
}

function runCommand(command, args) {
  const isWindows = process.platform === "win32";
  const commandLine = [command, ...args]
    .map((part) => (/[\s"]/u.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part))
    .join(" ");
  const result = isWindows
    ? spawnSync(commandLine, {
        encoding: "utf8",
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawnSync(command, args, {
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: `${String(result.stderr || "")}${result.error ? `\n${result.error.message}` : ""}`,
  };
}

function trimOutput(text, maxLines = 12) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length <= maxLines) return lines.join("\n");
  return `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} more line(s))`;
}

function checkGitState() {
  const branchResult = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branchResult.status !== 0) {
    return {
      ok: false,
      details: "Not a git repository, or git is unavailable in this shell.",
    };
  }

  const branch = branchResult.stdout.trim();
  const dirtyResult = runCommand("git", ["status", "--porcelain"]);
  const changedCount = dirtyResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  const protectedBranch = branch === "main" || branch === "master";

  return {
    ok: !protectedBranch && changedCount > 0,
    details: [
      `branch: ${branch}${protectedBranch ? " (protected for non-release runs)" : ""}`,
      `pending changes: ${changedCount}`,
    ].join("\n"),
  };
}

function runCheck(title, command, args, { optional = false } = {}) {
  const result = runCommand(command, args);
  const ok = result.status === 0 || optional;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return {
    title,
    ok,
    optional,
    status: result.status,
    output: trimOutput(output),
  };
}

const checks = [];
if (!cliArgs.has("--no-env-file")) {
  const envFileArg = [...cliArgs].find((arg) => arg.startsWith("--env-file="));
  const envFilePath = envFileArg ? envFileArg.slice("--env-file=".length) : ".env.pipeline";
  const envLoad = loadEnvFile(envFilePath);
  if (envLoad.found) {
    console.log(`Loaded ${envLoad.loaded} env value(s) from ${envFilePath}`);
  } else {
    console.log(`Env file not found: ${envFilePath} (continuing with current shell env)`);
  }
}

checks.push({
  title: "git readiness",
  ...checkGitState(),
  optional: false,
  status: 0,
});
checks.push(runCheck("environment doctor", "npm", ["run", "doctor:env"]));
checks.push(runCheck("format check", "npm", ["run", "format:check"]));
checks.push(runCheck("tests", "npm", ["test"]));
checks.push(
  runCheck("ops snapshot (optional)", "npm", ["run", "ops:status"], {
    optional: true,
  }),
);

console.log("Readiness report");
console.log("================");

for (const check of checks) {
  const symbol = check.ok ? "PASS" : "FAIL";
  const optionalTag = check.optional ? " (optional)" : "";
  console.log(`\n[${symbol}] ${check.title}${optionalTag}`);
  if (check.details) {
    console.log(check.details);
  }
  if (check.output) {
    console.log(check.output);
  }
}

const requiredFailures = checks.filter((check) => !check.optional && !check.ok);
if (requiredFailures.length > 0) {
  console.log(
    `\nReadiness failed: ${requiredFailures.length} required check(s) need attention.`,
  );
  process.exit(1);
}

console.log("\nReadiness passed: required checks are green.");
