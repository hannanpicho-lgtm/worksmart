#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const WORKFLOWS = [
  { id: "quality-checks.yml", label: "Quality Checks" },
  { id: "cloudflare-pages.yml", label: "Deploy Cloudflare Pages" },
  { id: "monitor-production.yml", label: "Monitor Production" },
];

function readConfig() {
  return JSON.parse(readFileSync(resolve(process.cwd(), "pipeline.config.json"), "utf8"));
}

function parseGitHubRepo(remoteUrl) {
  const raw = String(remoteUrl || "").trim();
  if (raw.startsWith("git@github.com:")) {
    const repo = raw.replace("git@github.com:", "").replace(/\.git$/, "");
    const [owner, name] = repo.split("/");
    return { owner, repo: name };
  }
  if (raw.startsWith("https://github.com/")) {
    const repo = raw.replace("https://github.com/", "").replace(/\.git$/, "");
    const [owner, name] = repo.split("/");
    return { owner, repo: name };
  }
  return null;
}

function detectRepo() {
  const ownerEnv = String(process.env.GITHUB_OWNER || "").trim();
  const repoEnv = String(process.env.GITHUB_REPO || "").trim();
  if (ownerEnv && repoEnv) return { owner: ownerEnv, repo: repoEnv };
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf8" });
    return parseGitHubRepo(remote);
  } catch {
    return null;
  }
}

async function fetchJson(url, token = "") {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function ageMinutes(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 60000;
}

function statusIcon(run) {
  if (!run) return "⚪";
  if (run.status !== "completed") return "🟡";
  return run.conclusion === "success" ? "🟢" : "🔴";
}

async function main() {
  const cfg = readConfig();
  const repo = detectRepo();
  const token = String(process.env.GITHUB_TOKEN || "").trim();

  console.log("Ops status:");
  if (!repo) {
    console.error("Unable to detect GitHub repo. Set GITHUB_OWNER/GITHUB_REPO.");
    process.exit(1);
  }
  console.log(`- repo: ${repo.owner}/${repo.repo}`);

  const prodUrl = String(cfg?.deploy?.productionUrl || "").trim();
  if (!prodUrl) {
    console.error("Missing deploy.productionUrl in pipeline.config.json");
    process.exit(1);
  }

  // Live endpoint checks
  const pagesRes = await fetch(prodUrl);
  console.log(`- pages: ${pagesRes.status} ${pagesRes.statusText} (${prodUrl})`);

  const healthUrl = String(cfg?.workers?.formAnalytics?.verifyHealthUrl || "").trim();
  if (healthUrl) {
    const healthRes = await fetch(healthUrl);
    let ok = false;
    try {
      const body = await healthRes.json();
      ok = body?.ok === true;
    } catch {
      ok = false;
    }
    console.log(`- worker health: ${healthRes.status} ${ok ? "ok" : "not-ok"} (${healthUrl})`);
  } else {
    console.log("- worker health: skipped (verifyHealthUrl not configured)");
  }

  // Workflow run status
  for (const wf of WORKFLOWS) {
    const url =
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/workflows/${wf.id}/runs` +
      `?branch=main&per_page=1`;
    try {
      const data = await fetchJson(url, token);
      const run = data?.workflow_runs?.[0];
      if (!run) {
        console.log(`- ${wf.label}: ⚪ no runs`);
        continue;
      }
      const age = ageMinutes(run.updated_at);
      const ageText = age == null ? "age=unknown" : `age=${age.toFixed(1)}m`;
      console.log(
        `- ${wf.label}: ${statusIcon(run)} ${run.status}/${run.conclusion || "n/a"} ${ageText} (${run.html_url})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`- ${wf.label}: ⚪ unavailable (${msg})`);
    }
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ops:status failed: ${msg}`);
  process.exit(1);
});
