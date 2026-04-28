#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = {
    timeoutMs: 10 * 60 * 1000,
    intervalMs: 10 * 1000,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "timeout-ms") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.timeoutMs = n;
    } else if (k === "interval-ms") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.intervalMs = n;
    }
  }
  return out;
}

function readOpsStatus() {
  const result = spawnSync("node", ["scripts/ops-status.mjs", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const msg = String(result.stderr || result.stdout || "ops:status failed").trim();
    throw new Error(msg);
  }
  return JSON.parse(String(result.stdout || "{}"));
}

function workflowByLabel(snapshot, label) {
  return (snapshot.workflows || []).find((w) => w.label === label) || null;
}

function workflowGreen(snapshot, label) {
  const wf = workflowByLabel(snapshot, label);
  if (!wf || !wf.available) return false;
  return wf.status === "completed" && wf.conclusion === "success";
}

function evaluate(snapshot) {
  const pagesOk = Number(snapshot?.pages?.status) >= 200 && Number(snapshot?.pages?.status) < 400;
  const worker = snapshot?.worker_health;
  const workerOk = worker?.skipped === true || (Number(worker?.status) === 200 && worker?.ok === true);

  const qualityOk = workflowGreen(snapshot, "Quality Checks");
  const deployOk = workflowGreen(snapshot, "Deploy Cloudflare Pages");

  return {
    ok: pagesOk && workerOk && qualityOk && deployOk,
    pagesOk,
    workerOk,
    qualityOk,
    deployOk,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deadline = Date.now() + args.timeoutMs;
  let attempt = 0;

  while (Date.now() <= deadline) {
    attempt += 1;
    const snapshot = readOpsStatus();
    const verdict = evaluate(snapshot);

    const q = workflowByLabel(snapshot, "Quality Checks");
    const d = workflowByLabel(snapshot, "Deploy Cloudflare Pages");
    const pagesStatus = snapshot?.pages?.status ?? "n/a";
    const workerText =
      snapshot?.worker_health?.skipped === true
        ? "skipped"
        : `${snapshot?.worker_health?.status ?? "n/a"}-${snapshot?.worker_health?.ok ? "ok" : "not-ok"}`;

    process.stdout.write(
      `[ops:watch] attempt=${attempt} pages=${pagesStatus} worker=${workerText} ` +
        `quality=${q?.status || "n/a"}/${q?.conclusion || "n/a"} ` +
        `deploy=${d?.status || "n/a"}/${d?.conclusion || "n/a"}\n`,
    );

    if (verdict.ok) {
      process.stdout.write("ops:watch success: post-merge status is green.\n");
      return;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(args.intervalMs, remaining));
  }

  throw new Error(
    "ops:watch timeout: required post-merge checks are not all green yet " +
      "(pages, worker health, Quality Checks, Deploy Cloudflare Pages).",
  );
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
