#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnvFile } from "./lib/env-file.mjs";

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
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

function findLatestHandoff(logsDir) {
  if (!existsSync(logsDir)) return null;
  const latest = readdirSync(logsDir)
    .filter((name) => /^release-handoff-.*\.md$/i.test(name))
    .sort((a, b) => b.localeCompare(a))[0];
  if (!latest) return null;
  return {
    path: resolve(logsDir, latest),
  };
}

function readLatestBundle(logsDir) {
  const indexPath = resolve(logsDir, "release-index.json");
  const idx = readJsonIfExists(indexPath);
  if (idx && Array.isArray(idx.bundles) && idx.bundles[0]) {
    return idx.bundles[0];
  }
  return null;
}

function workflowStatus(ops, label) {
  const wf = (ops.workflows || []).find((w) => w.label === label);
  if (!wf || wf.available !== true) return "unavailable";
  return `${wf.status}/${wf.conclusion || "n/a"}`;
}

function main() {
  loadEnvFile(".env.pipeline");
  const logsDir = resolve(process.cwd(), "logs");
  const latestHandoff = findLatestHandoff(logsDir);
  const latestBundle = readLatestBundle(logsDir);
  const ops = runOpsStatusJson();

  const lines = [
    "Release latest:",
    `- checked_at: ${new Date().toISOString()}`,
    `- pages: ${ops?.pages?.status ?? "n/a"} ${ops?.pages?.status_text ?? ""}`,
    `- worker: ${
      ops?.worker_health?.skipped
        ? `skipped (${ops?.worker_health?.reason || "n/a"})`
        : `${ops?.worker_health?.status ?? "n/a"} ${ops?.worker_health?.ok ? "ok" : "not-ok"}`
    }`,
    `- quality_checks: ${workflowStatus(ops, "Quality Checks")}`,
    `- deploy_cloudflare_pages: ${workflowStatus(ops, "Deploy Cloudflare Pages")}`,
    `- monitor_production: ${workflowStatus(ops, "Monitor Production")}`,
    `- latest_handoff: ${latestHandoff?.path || "n/a"}`,
    `- latest_bundle_summary: ${latestBundle?.summary_file || "n/a"}`,
    `- latest_release_notes: ${latestBundle?.release_notes_md || "n/a"}`,
  ];

  console.log(lines.join("\n"));
}

main();
