#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "./lib/env-file.mjs";
import { currentBranch, headSha, remoteUrl } from "./lib/git.mjs";

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function runGit(args) {
  return spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runNpm(args) {
  return spawnSync("npm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
}

function combineOut(result) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trimEnd();
}

function parseArgs(argv) {
  return {
    noTag: argv.includes("--no-tag"),
    noSlack: argv.includes("--no-slack"),
  };
}

function defaultTagBase() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `v${yyyy}.${mm}.${dd}-${hh}${mi}`;
}

function gitTagExists(name) {
  return runGit(["rev-parse", `refs/tags/${name}`]).status === 0;
}

function resolveUniqueReleaseTag() {
  const base = defaultTagBase();
  if (!gitTagExists(base)) return base;
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${base}-${n}`;
    if (!gitTagExists(candidate)) return candidate;
  }
  throw new Error("Could not find unused release tag name (99 suffix attempts exhausted).");
}

async function postSlackWebhook(webhookUrl, text) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
}


function detectPrNumber() {
  const subject = runGit(["log", "-1", "--pretty=%s"]);
  if (subject.status !== 0) return null;
  const s = subject.stdout.trim();
  const squash = s.match(/\(#(\d+)\)\s*$/);
  if (squash) return squash[1];
  const body = runGit(["log", "-1", "--pretty=%B"]);
  if (body.status === 0) {
    const merge = body.stdout.match(/Merge pull request #(\d+)/);
    if (merge) return merge[1];
    const paren = body.stdout.match(/\(#(\d+)\)/);
    if (paren) return paren[1];
  }
  return null;
}

function runOpsStatusJson() {
  const result = spawnSync("node", ["scripts/ops-status.mjs", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const msg = combineOut(result) || "ops-status failed";
    throw new Error(msg);
  }
  return JSON.parse(String(result.stdout || "{}"));
}

function formatWorkflowLine(wf) {
  if (!wf || wf.available !== true) return "unavailable";
  return `${wf.status}/${wf.conclusion || "n/a"} (${wf.html_url || "no-url"})`;
}

function runDoctorSnippet() {
  const r = runNpm(["run", "doctor:env"]);
  const out = combineOut(r);
  const lines = out.split(/\r?\n/).filter(Boolean);
  return lines.slice(0, 25).join("\n") + (lines.length > 25 ? "\n..." : "");
}

async function mainAsync() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(".env.pipeline");

  const logsDir = resolve(process.cwd(), "logs");
  mkdirSync(logsDir, { recursive: true });

  const steps = [];
  const blockers = [];

  const fetchResult = runGit(["fetch", "origin"]);
  const fetchOk = fetchResult.status === 0;
  steps.push({
    name: "git fetch origin",
    ok: fetchOk,
    detail: fetchOk ? "ok" : combineOut(fetchResult) || `exit ${fetchResult.status}`,
  });
  if (!fetchOk) blockers.push("git fetch origin failed — fix network/auth and retry.");

  const syncResult = runNpm(["run", "branch:check"]);
  const syncOk = syncResult.status === 0;
  const syncOut = combineOut(syncResult);
  steps.push({
    name: "npm run branch:check",
    ok: syncOk,
    detail: syncOut || "(no output)",
  });
  if (!syncOk) {
    blockers.push(
      "Branch is not synced with origin/main (or branch:check failed). Merge/rebase before go-live.",
    );
  }

  const readinessResult = runNpm(["run", "readiness:report", "--", "--release"]);
  const readinessOk = readinessResult.status === 0;
  const readinessOut = combineOut(readinessResult);
  steps.push({
    name: "npm run readiness:report -- --release",
    ok: readinessOk,
    detail: readinessOut || "(no output)",
  });
  if (!readinessOk) {
    blockers.push("Release readiness failed — review readiness:report output for failing gates.");
  }

  const watchResult = runNpm(["run", "ops:watch"]);
  const watchOk = watchResult.status === 0;
  const watchOut = combineOut(watchResult);
  steps.push({
    name: "npm run ops:watch",
    ok: watchOk,
    detail: watchOut || "(no output)",
  });
  if (!watchOk) {
    blockers.push("ops:watch did not reach green — fix Pages/Worker/workflows before go-live.");
  }

  const branch = currentBranch();
  const sha = headSha("HEAD");
  const pr = detectPrNumber();
  const remote = remoteUrl();
  const goLive = fetchOk && syncOk && readinessOk && watchOk;

  let releaseTag = null;
  let tagCreateDetail = "(skipped)";
  let tagPushDetail = "(skipped)";
  if (goLive && !args.noTag) {
    try {
      releaseTag = resolveUniqueReleaseTag();
      const tagMessage = `release go-live ${releaseTag} ${sha}`;
      const tagResult = runGit(["tag", "-a", releaseTag, "-m", tagMessage, sha]);
      if (tagResult.status !== 0) {
        tagCreateDetail = combineOut(tagResult) || `exit ${tagResult.status}`;
        releaseTag = null;
      } else {
        tagCreateDetail = `created annotated tag ${releaseTag} at ${sha}`;
        const pushTag = runGit(["push", "origin", releaseTag]);
        if (pushTag.status !== 0) {
          tagPushDetail =
            combineOut(pushTag) ||
            `git push origin ${releaseTag} failed (exit ${pushTag.status}); tag exists locally only`;
        } else {
          tagPushDetail = `pushed ${releaseTag} to origin`;
        }
      }
    } catch (err) {
      releaseTag = null;
      tagCreateDetail = err instanceof Error ? err.message : String(err);
    }
  } else if (!goLive) {
    tagCreateDetail = "(GO LIVE: NO — no tag created)";
  } else {
    tagCreateDetail = "(skipped: --no-tag)";
    tagPushDetail = "(skipped: --no-tag)";
  }

  let ops = null;
  try {
    ops = runOpsStatusJson();
  } catch (err) {
    blockers.push(`Post-run ops snapshot failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const quality = ops?.workflows?.find((w) => w.label === "Quality Checks");
  const deploy = ops?.workflows?.find((w) => w.label === "Deploy Cloudflare Pages");
  const monitor = ops?.workflows?.find((w) => w.label === "Monitor Production");

  const pagesLine = ops
    ? `- pages: ${ops.pages?.status ?? "n/a"} ${ops.pages?.status_text ?? ""} (${ops.pages?.url ?? "n/a"})`
    : "- pages: (snapshot unavailable)";

  const workerLine = ops
    ? ops.worker_health?.skipped
      ? `- worker health: skipped (${ops.worker_health?.reason || "n/a"})`
      : `- worker health: ${ops.worker_health?.status ?? "n/a"} ${
          ops.worker_health?.ok ? "ok" : "not-ok"
        } (${ops.worker_health?.url ?? "n/a"})`
    : "- worker health: (snapshot unavailable)";

  const wfLines = ops
    ? [
        `- Quality Checks: ${formatWorkflowLine(quality)}`,
        `- Deploy Cloudflare Pages: ${formatWorkflowLine(deploy)}`,
        `- Monitor Production: ${formatWorkflowLine(monitor)}`,
      ]
    : ["- (workflow snapshot unavailable)"];

  const optionalEnv = runDoctorSnippet();

  const ts = stamp();
  const outPath = resolve(logsDir, `release-go-live-${ts}.md`);

  const mdLines = [
    "# Go-live release handoff",
    "",
    `generated_at_utc: ${new Date().toISOString()}`,
    "",
    "## Verdict",
    "",
    `**GO LIVE: ${goLive ? "YES" : "NO"}**`,
    "",
    "## Release context",
    "",
    `- **branch:** ${branch}`,
    `- **commit SHA:** ${sha}`,
    pr ? `- **PR:** #${pr}` : "- **PR:** not detected (no `(#nnn)` in latest commit subject / merge message)",
    `- **remote:** ${remote}`,
    releaseTag ? `- **release tag:** ${releaseTag}` : "- **release tag:** (none — see Release versioning below)",
    "",
    "## Release versioning",
    "",
    `- **tag create:** ${tagCreateDetail}`,
    `- **tag push:** ${tagPushDetail}`,
    "",
    "## Commands executed",
    "",
    ...steps.map((s, i) => {
      const sym = s.ok ? "PASS" : "FAIL";
      return [
      `### ${i + 1}. ${s.name} — ${sym}`,
      "",
      "```",
      trimForFile(s.detail, 220),
      "```",
      "",
    ].join("\n");
    }),
    "## Production snapshot (after ops:watch)",
    "",
    pagesLine,
    workerLine,
    "",
    "### Workflows",
    ...wfLines,
    "",
    "## Optional environment (not required for go-live)",
    "",
    "```",
    optionalEnv || "(doctor:env output empty)",
    "```",
    "",
  ];

  if (!goLive) {
    mdLines.push("## Blockers", "", ...blockers.map((b) => `- ${b}`), "");
  }

  writeFileSync(outPath, `${mdLines.join("\n")}\n`);

  const broadcast = [
    `GO LIVE: ${goLive ? "YES" : "NO"}`,
    "",
    `Branch: ${branch}`,
    `Commit: ${sha}`,
    releaseTag ? `Release tag: ${releaseTag}` : "Release tag: (none)",
    pr ? `PR: #${pr}` : "PR: (not detected)",
    "",
    "**Checks**",
    `- git fetch origin — ${fetchOk ? "PASS" : "FAIL"}`,
    `- npm run branch:check — ${syncOk ? "PASS" : "FAIL"}`,
    `- npm run readiness:report -- --release — ${readinessOk ? "PASS" : "FAIL"}`,
    `- npm run ops:watch — ${watchOk ? "PASS" : "FAIL"}`,
    "",
    "**Production**",
    pagesLine.replace(/^- /, ""),
    workerLine.replace(/^- /, ""),
    ...wfLines.map((l) => l.replace(/^- /, "")),
    "",
    `Handoff file: ${outPath}`,
    ...(goLive
      ? []
      : ["", "**Blockers**", ...blockers.map((b) => `- ${b}`)]),
    "",
  ].join("\n");

  process.stdout.write("\n---\n");
  process.stdout.write("BROADCAST (Slack / email)\n");
  process.stdout.write("---\n\n");
  process.stdout.write(broadcast);
  process.stdout.write("\n");

  console.log(`\nSaved go-live handoff: ${outPath}`);

  const slackUrl = String(process.env.SLACK_WEBHOOK_URL || "").trim();
  if (slackUrl && !args.noSlack) {
    try {
      await postSlackWebhook(slackUrl, broadcast);
      process.stdout.write("\nSlack: broadcast posted to SLACK_WEBHOOK_URL.\n");
    } catch (err) {
      process.stderr.write(
        `\nSlack: webhook post failed (${err instanceof Error ? err.message : String(err)}). Broadcast was still printed above.\n`,
      );
    }
  } else if (!slackUrl) {
    process.stdout.write(
      "\nSlack: SLACK_WEBHOOK_URL not set — broadcast is console-only (no behavior change).\n",
    );
  } else {
    process.stdout.write("\nSlack: skipped (--no-slack).\n");
  }

  if (!goLive) {
    process.exit(1);
  }
}

mainAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
