#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnvFile } from "./lib/env-file.mjs";

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function runOpsStatusJson() {
  const result = spawnSync("node", ["scripts/ops-status.mjs", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const msg = String(result.stderr || result.stdout || "ops-status failed").trim();
    throw new Error(msg);
  }
  return JSON.parse(String(result.stdout || "{}"));
}

function readLatestBundle(logsDir) {
  const indexPath = resolve(logsDir, "release-index.json");
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const first = Array.isArray(index?.bundles) ? index.bundles[0] : null;
    if (first) return first;
  }

  const fallbackResult = spawnSync("node", ["scripts/release-index.mjs", "--limit=1"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (fallbackResult.status !== 0) {
    return null;
  }
  const refreshed = JSON.parse(readFileSync(indexPath, "utf8"));
  return Array.isArray(refreshed?.bundles) ? refreshed.bundles[0] || null : null;
}

function formatWorkflowLine(wf) {
  if (!wf || wf.available !== true) {
    return "unavailable";
  }
  return `${wf.status}/${wf.conclusion || "n/a"} (${wf.html_url || "no-url"})`;
}

function main() {
  loadEnvFile(".env.pipeline");

  const logsDir = resolve(process.cwd(), "logs");
  mkdirSync(logsDir, { recursive: true });

  const ops = runOpsStatusJson();
  const latestBundle = readLatestBundle(logsDir);
  const ts = stamp();
  const outPath = resolve(logsDir, `release-handoff-${ts}.md`);

  const quality = (ops.workflows || []).find((w) => w.label === "Quality Checks");
  const deploy = (ops.workflows || []).find((w) => w.label === "Deploy Cloudflare Pages");
  const monitor = (ops.workflows || []).find((w) => w.label === "Monitor Production");

  const lines = [
    "# Release Handoff Snapshot",
    "",
    `generated_at_utc: ${new Date().toISOString()}`,
    `repo: ${ops.repo || "unknown"}`,
    "",
    "## Live status",
    `- pages: ${ops?.pages?.status ?? "n/a"} ${ops?.pages?.status_text ?? ""} (${ops?.pages?.url ?? "n/a"})`,
    ops?.worker_health?.skipped
      ? `- worker health: skipped (${ops?.worker_health?.reason || "n/a"})`
      : `- worker health: ${ops?.worker_health?.status ?? "n/a"} ${
          ops?.worker_health?.ok ? "ok" : "not-ok"
        } (${ops?.worker_health?.url ?? "n/a"})`,
    "",
    "## Main workflow status",
    `- Quality Checks ${formatWorkflowLine(quality)}`,
    `- Deploy Cloudflare Pages ${formatWorkflowLine(deploy)}`,
    `- Monitor Production ${formatWorkflowLine(monitor)}`,
    "",
    "## Latest release bundle",
  ];

  if (!latestBundle) {
    lines.push("- none found");
  } else {
    lines.push(`- captured_at_utc: ${latestBundle.captured_at_utc || "n/a"}`);
    lines.push(`- summary: ${latestBundle.summary_file || "n/a"}`);
    lines.push(`- release_notes_md: ${latestBundle.release_notes_md || "n/a"}`);
    lines.push(`- ops_status_json: ${latestBundle.ops_status_json || "n/a"}`);
    lines.push(`- incident_template_md: ${latestBundle.incident_template_md || "n/a"}`);
  }

  lines.push("");
  writeFileSync(outPath, `${lines.join("\n")}\n`);
  console.log(`Saved release handoff: ${outPath}`);
}

main();
