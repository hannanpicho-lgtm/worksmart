#!/usr/bin/env node

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runShell } from "./lib/exec.mjs";
import {
  changedFiles,
  currentBranch,
  git,
  hasDiffStagedOrUnstaged,
  headSha,
  remoteUrl,
  workingTreeDirty,
} from "./lib/git.mjs";
import { parseGitHubRepo, upsertPr, mergePr } from "./lib/github.mjs";
import {
  deploymentCommitSha,
  getLatestDeployment,
  triggerDeployHook,
  triggerPagesDeployment,
  waitForDeploymentSuccess,
} from "./lib/cloudflare.mjs";
import { acquireLock, releaseLock } from "./lib/lock.mjs";
import { inferSemanticCommitMessage } from "./lib/commit.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const releaseMode = args.has("--release");
const skipDeploy = args.has("--skip-deploy");
const skipWorkerDeploy = args.has("--skip-worker-deploy");
const autoMerge = args.has("--auto-merge");
const allowProtected = args.has("--allow-protected");

const configPath = resolve(process.cwd(), "pipeline.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const runLog = {
  startedAt: new Date().toISOString(),
  dryRun,
  releaseMode,
  skipDeploy,
  skipWorkerDeploy,
  autoMerge,
  allowProtected,
  stateTransitions: [],
  stages: [],
};

const STATE = {
  PENDING: "PENDING",
  VALIDATING: "VALIDATING",
  PRECHECK: "PRECHECK",
  COMMITTING: "COMMITTING",
  PUSHING: "PUSHING",
  PR_CREATING: "PR_CREATING",
  DEPLOYING: "DEPLOYING",
  VERIFYING: "VERIFYING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
};

function setState(state) {
  runLog.stateTransitions.push({
    state,
    at: new Date().toISOString(),
  });
  process.stdout.write(`\n▶ State: ${state}\n`);
}

function stage(name, fixHint, fn) {
  return Promise.resolve()
    .then(async () => {
      const startedAt = Date.now();
      const result = await fn();
      runLog.stages.push({
        name,
        status: "success",
        elapsedMs: Date.now() - startedAt,
      });
      return result;
    })
    .catch((error) => {
      runLog.stages.push({
        name,
        status: "failed",
        error: error.message,
        fixHint,
      });
      const formatted = new Error(
        `❌ Stage: ${name} failed\n→ Reason: ${error.message}${
          fixHint ? `\n→ Fix: ${fixHint}` : ""
        }`,
      );
      throw formatted;
    });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        "Set this in your shell or .env loader before running the pipeline.",
    );
  }
  return value;
}

function printHeader(text) {
  process.stdout.write(`\n=== ${text} ===\n`);
}

function saveRunLog(finalStatus) {
  runLog.completedAt = new Date().toISOString();
  runLog.finalStatus = finalStatus;
  mkdirSync(resolve(process.cwd(), "logs"), { recursive: true });
  const filename = `pipeline-${Date.now()}.json`;
  writeFileSync(resolve(process.cwd(), "logs", filename), JSON.stringify(runLog, null, 2));
  process.stdout.write(`Pipeline log: logs/${filename}\n`);
}

function detectOptionalGates() {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
  const scripts = pkg?.scripts ?? {};
  return (config.qualityGates.optionalFromNpmScripts ?? [])
    .filter((name) => typeof scripts[name] === "string")
    .map((name) => `npm run ${name}`);
}

function buildPrBody(branchName, files) {
  return [
    "## Automated Pipeline PR",
    "",
    `Branch: \`${branchName}\``,
    "",
    "### Changed files",
    ...files.map((f) => `- \`${f}\``),
    "",
    "### Local gates executed",
    ...(runLog.executedGates ?? []).map((g) => `- ✅ \`${g}\``),
  ].join("\n");
}

function resolveDeployEnvironments(configured, { releaseMode, autoMergeEnabled }) {
  const requested = configured ?? ["auto"];
  if (!Array.isArray(requested) || requested.length === 0) return ["preview"];
  if (!requested.includes("auto")) return requested;
  return releaseMode || autoMergeEnabled ? ["production"] : ["preview"];
}

function resolveDeployMode(configuredMode, hookUrl) {
  const mode = configuredMode ?? "manual";
  if (mode !== "auto") return mode;
  return hookUrl ? "hook" : "api";
}

function requireFullyAutomatedDeployMode(mode) {
  if (mode === "manual") {
    throw new Error(
      'deploy.mode is set to "manual", which disables automatic deployment.\n' +
        'Set deploy.mode to "auto", "hook", or "api" in pipeline.config.json for fully automated runs.',
    );
  }
}

async function main() {
  setState(STATE.PENDING);
  printHeader("Pipeline Start");
  const lockPath = resolve(process.cwd(), config.lockFile ?? ".pipeline.lock");
  acquireLock(lockPath);

  const branch = await stage(
    "validation",
    "Switch to a feature/fix/chore branch and ensure pending changes exist.",
    async () => {
      setState(STATE.VALIDATING);

    const name = currentBranch();
    const dirty = workingTreeDirty();
    if (!dirty) throw new Error("No local changes detected. Nothing to pipeline.");

    if (
      config.safety.blockMainBranchForNonRelease &&
      !releaseMode &&
      !allowProtected &&
      (name === "main" || name === "master")
    ) {
      throw new Error(
        `Blocked on protected branch "${name}". Use a feature/fix/chore branch or run with --release.`,
      );
    }

    if (
      !releaseMode &&
      !config.allowedBranchPrefixes.some((prefix) => name.startsWith(prefix))
    ) {
      throw new Error(
        `Branch "${name}" does not match allowed prefixes: ${config.allowedBranchPrefixes.join(", ")}`,
      );
    }

      if (releaseMode && (name === "main" || name === "master") && !allowProtected) {
        throw new Error(
          "Release mode on protected branch requires explicit --allow-protected acknowledgment.",
        );
      }

      process.stdout.write("✔ Stage: validation passed\n");
    return name;
    },
  );

  const files = changedFiles().filter(
    (f) => f !== (config.lockFile ?? ".pipeline.lock") && !f.startsWith("logs/"),
  );
  process.stdout.write(`Branch: ${branch}\n`);
  process.stdout.write(`Changed files (${files.length}):\n${files.map((f) => ` - ${f}`).join("\n")}\n`);

  await stage(
    "precheck",
    "Run the suggested command in the error output and retry.",
    async () => {
      setState(STATE.PRECHECK);
    printHeader("Quality Gates");
      const gates = [...(config.qualityGates.required ?? []), ...detectOptionalGates()];
      runLog.executedGates = gates;
      for (const gate of gates) {
      process.stdout.write(`Running: ${gate}\n`);
      runShell(gate, { stdio: "inherit" });
    }
      process.stdout.write("✔ Stage: precheck passed\n");
    },
  );

  let commitMessage = inferSemanticCommitMessage(files);
  let commitSha = headSha();

  await stage(
    "commit",
    "Resolve git conflicts or stage-ready changes, then rerun.",
    async () => {
      setState(STATE.COMMITTING);
      printHeader("Git Commit Stage");
    if (dryRun) {
        process.stdout.write("[dry-run] skipping commit\n");
      return;
    }

      if (!hasDiffStagedOrUnstaged()) {
        process.stdout.write("✔ Stage: commit skipped (no diff)\n");
        return;
      }

      git("add", "-A");
      if (!hasDiffStagedOrUnstaged()) {
        process.stdout.write("✔ Stage: commit skipped (no staged diff)\n");
        return;
      }

      const commitAttempt = git("commit", "-m", commitMessage, "--allow-empty", "--allow-empty-message");
      process.stdout.write(commitAttempt.stdout || "");
      commitSha = headSha();
      runLog.commit = { message: commitMessage, sha: commitSha };
      process.stdout.write("✔ Stage: commit created\n");
    },
  );

  await stage(
    "push",
    "Check remote permissions and branch tracking, then rerun.",
    async () => {
      setState(STATE.PUSHING);
      printHeader("Git Push Stage");
      if (dryRun) {
        process.stdout.write("[dry-run] skipping push\n");
        return;
      }
      git("push", "-u", "origin", branch);
      process.stdout.write("✔ Stage: push successful\n");
    },
  );

  await stage(
    "worker-deploy",
    "Run `npx wrangler login` once on this machine, ensure `CLOUDFLARE_API_TOKEN` is set, or pass `--skip-worker-deploy`.",
    async () => {
      if (dryRun || skipWorkerDeploy) {
        process.stdout.write(
          skipWorkerDeploy
            ? "Worker deploy skipped (--skip-worker-deploy).\n"
            : "[dry-run] skipping Worker deploy\n",
        );
        return;
      }
      const wf = config.workers?.formAnalytics;
      if (!wf || wf.enabled === false) {
        process.stdout.write(
          "Worker auto-deploy disabled (set workers.formAnalytics.enabled true in pipeline.config.json).\n",
        );
        return;
      }
      const prefix = wf.pathPrefix || "workers/form-analytics/";
      const touched = files.some((f) => f.startsWith(prefix));
      if (!touched) {
        process.stdout.write(
          "Worker deploy skipped (no changes under form analytics paths).\n",
        );
        return;
      }
      const cfgRel = wf.wranglerConfig || "workers/form-analytics/wrangler.toml";
      printHeader("Cloudflare Worker deploy (form analytics)");
      requireEnv("CLOUDFLARE_API_TOKEN");
      runShell(`npx wrangler deploy --config "${cfgRel}"`, { stdio: "inherit" });
      process.stdout.write("✔ Stage: worker-deploy passed\n");
    },
  );

  await stage(
    "pr-creating",
    "Ensure GITHUB_TOKEN has repo scope and remote is github.com.",
    async () => {
      setState(STATE.PR_CREATING);
    if (!config.github.autoCreatePr) return;
    printHeader("GitHub PR Stage");
    if (dryRun) {
      process.stdout.write("[dry-run] skipping PR create/update\n");
      return;
    }
    const token = requireEnv("GITHUB_TOKEN");
    const { owner, repo } = parseGitHubRepo(remoteUrl());
      const prTitle = runLog.commit?.message || commitMessage;
    const body = buildPrBody(branch, files);
    const pr = await upsertPr({
      token,
      owner,
      repo,
      headBranch: branch,
      baseBranch: config.defaultBaseBranch,
        title: prTitle,
      body,
    });
    runLog.pullRequest = pr;
      process.stdout.write(`✔ Stage: PR ${pr.updated ? "updated" : "created"}\n`);
      process.stdout.write(`PR URL: ${pr.html_url}\n`);

    if (autoMerge || config.github.autoMerge) {
      await mergePr({
        token,
        owner,
        repo,
        pullNumber: pr.number,
        method: config.github.mergeMethod ?? "squash",
      });
      process.stdout.write(`Merged PR #${pr.number}\n`);
    }
    },
  );

  await stage(
    "deploying",
    "Check Cloudflare token/account/project, or run with --skip-deploy.",
    async () => {
      setState(STATE.DEPLOYING);
    if (skipDeploy || !config.deploy.enabled) {
      process.stdout.write("Deploy skipped by config/flag.\n");
      return;
    }
    printHeader("Cloudflare Deploy Stage");
    if (dryRun) {
      process.stdout.write("[dry-run] skipping Cloudflare deploy trigger\n");
      return;
    }
    const token = requireEnv("CLOUDFLARE_API_TOKEN");
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    const projectName = requireEnv("CLOUDFLARE_PROJECT_NAME");
      const targetSha = dryRun ? headSha("HEAD") : headSha("HEAD");
      const autoMergeEnabled = autoMerge || config.github.autoMerge;
      const environments = resolveDeployEnvironments(config.deploy.environments, {
        releaseMode,
        autoMergeEnabled,
      });
      runLog.deployments = [];

      for (const environment of environments) {
        const deployBranch =
          environment === "preview" ? branch : config.defaultBaseBranch;
        if (
          environment === "production" &&
          !releaseMode &&
          !(autoMerge || config.github.autoMerge)
        ) {
          throw new Error(
            "Production deploy requested before merge. Use preview environment for feature branches, or run release mode after merge.",
          );
        }
        const latest = await getLatestDeployment({
          token,
          accountId,
          projectName,
          branch: deployBranch,
          environment,
        });
        const latestSha = deploymentCommitSha(latest);
        const latestStatus = latest?.latest_stage?.status;
        if (
          config.deploy.skipDuplicateCommitDeploy &&
          latestSha &&
          latestSha === targetSha &&
          latestStatus === "success"
        ) {
          process.stdout.write(
            `✔ Stage: deploy skipped for ${environment} (already successful for commit ${targetSha.slice(0, 7)})\n`,
          );
          runLog.deployments.push({
            environment,
            skipped: true,
            reason: "duplicate-commit-success",
            deploymentId: latest?.id,
            deploymentUrl: latest?.url,
          });
          continue;
        }

        const hookEnvVar =
          environment === "production"
            ? "CLOUDFLARE_DEPLOY_HOOK_URL_PRODUCTION"
            : "CLOUDFLARE_DEPLOY_HOOK_URL_PREVIEW";
        const hookUrl = process.env[hookEnvVar];
        const deployMode = resolveDeployMode(config.deploy.mode, hookUrl);
        requireFullyAutomatedDeployMode(deployMode);

        if (deployMode === "hook") {
          if (!hookUrl) {
            throw new Error(
              `Deploy mode is "hook" but ${hookEnvVar} is not set.\n` +
                "Create a Pages deploy hook and export the env variable.",
            );
          }
          await triggerDeployHook({ hookUrl });
        } else if (deployMode === "api") {
          try {
            await triggerPagesDeployment({
              token,
              accountId,
              projectName,
              branch: deployBranch,
            });
          } catch (error) {
            if (String(error.message).includes("manifest") && hookUrl) {
              process.stdout.write(
                `API trigger rejected for ${environment}; falling back to deploy hook.\n`,
              );
              await triggerDeployHook({ hookUrl });
            } else if (String(error.message).includes("manifest")) {
              throw new Error(
                `Cloudflare API rejected deployment trigger for Git-connected Pages project.\n` +
                  `Create a Pages deploy hook and set ${hookEnvVar}.\n` +
                  "Cloudflare dashboard -> Workers & Pages -> your project -> Settings -> Build & deployments -> Deploy hooks.",
              );
            } else {
              throw error;
            }
          }
        } else {
          throw new Error(
            `Unknown deploy mode "${deployMode}". Valid: hook | api | auto`,
          );
        }
        process.stdout.write(`✔ Stage: deploy triggered (${environment})\n`);

        const deployment = await waitForDeploymentSuccess({
          token,
          accountId,
          projectName,
          branch: deployBranch,
          environment,
          timeoutMs: config.deploy.timeoutMs,
          pollIntervalMs: config.deploy.pollIntervalMs,
        });
        runLog.deployments.push({
          environment,
          skipped: false,
          deploymentId: deployment?.id,
          deploymentUrl: deployment?.url,
          status: deployment?.latest_stage?.status,
          commitSha: deploymentCommitSha(deployment),
        });
        process.stdout.write(`✔ Stage: deploy ${environment} successful\n`);
      }
    },
  );

  await stage(
    "verifying",
    "Confirm production URL is reachable and markers are correct, then rerun.",
    async () => {
      setState(STATE.VERIFYING);
    if (skipDeploy || !config.deploy.enabled || dryRun) return;
    printHeader("Production Verification");
    const response = await fetch(config.deploy.productionUrl);
    const html = await response.text();
    for (const marker of config.deploy.verifyContains || []) {
      if (!html.includes(marker)) {
        throw new Error(
          `Production verification failed: marker "${marker}" not found at ${config.deploy.productionUrl}`,
        );
      }
    }
    process.stdout.write(`Verified production markers at ${config.deploy.productionUrl}\n`);
      process.stdout.write("✔ Stage: verification passed\n");
    },
  );
}

main()
  .then(() => {
    setState(STATE.SUCCESS);
    saveRunLog("success");
    process.stdout.write("\n✔ Pipeline SUCCESS\n");
  })
  .catch((error) => {
    setState(STATE.FAILED);
    saveRunLog("failed");
    process.stderr.write(`\n${error.message}\n`);
    process.exit(1);
  })
  .finally(() => {
    const lockPath = resolve(process.cwd(), config.lockFile ?? ".pipeline.lock");
    releaseLock(lockPath);
  });

