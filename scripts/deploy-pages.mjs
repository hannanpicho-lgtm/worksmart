#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentBranch } from "./lib/git.mjs";
import {
  triggerDeployHook,
  triggerPagesDeployment,
  waitForDeploymentSuccess,
} from "./lib/cloudflare.mjs";

const args = new Set(process.argv.slice(2));
const envArg =
  process.argv.includes("--env") && process.argv[process.argv.indexOf("--env") + 1]
    ? process.argv[process.argv.indexOf("--env") + 1]
    : "production";
const environment = envArg === "preview" ? "preview" : "production";
const skipVerify = args.has("--skip-verify");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveDeployMode(modeFromConfig, hookUrl) {
  const mode = modeFromConfig ?? "auto";
  if (mode !== "auto") return mode;
  return hookUrl ? "hook" : "api";
}

async function triggerViaApi({ token, accountId, projectName, branch, hookEnvVar, hookUrl }) {
  try {
    await triggerPagesDeployment({
      token,
      accountId,
      projectName,
      branch,
    });
  } catch (error) {
    if (String(error.message).includes("manifest") && hookUrl) {
      process.stdout.write("API trigger rejected; falling back to deploy hook.\n");
      await triggerDeployHook({ hookUrl });
      return;
    }
    if (String(error.message).includes("manifest")) {
      throw new Error(
        `Cloudflare API rejected deployment trigger for Git-connected Pages project.\nCreate a deploy hook and set ${hookEnvVar}.`,
      );
    }
    throw error;
  }
}

async function verifyProduction(config) {
  const targetUrl = config?.deploy?.productionUrl;
  const markers = config?.deploy?.verifyContains ?? [];
  if (!targetUrl) throw new Error("Missing deploy.productionUrl in pipeline.config.json");

  const res = await fetch(targetUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${targetUrl}: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const missing = markers.filter((marker) => !html.includes(marker));
  if (missing.length > 0) {
    throw new Error(
      `Production verification failed. Missing markers:\n${missing.map((m) => ` - ${m}`).join("\n")}`,
    );
  }
  process.stdout.write(`Verified production markers at ${targetUrl}\n`);
}

async function main() {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), "pipeline.config.json"), "utf8"));
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const projectName = requireEnv("CLOUDFLARE_PROJECT_NAME");

  const branch = environment === "preview" ? currentBranch() : config.defaultBaseBranch;
  const hookEnvVar =
    environment === "production"
      ? "CLOUDFLARE_DEPLOY_HOOK_URL_PRODUCTION"
      : "CLOUDFLARE_DEPLOY_HOOK_URL_PREVIEW";
  const hookUrl = process.env[hookEnvVar];
  const deployMode = resolveDeployMode(config.deploy?.mode, hookUrl);

  process.stdout.write(`Deploy target: ${environment} (${branch})\n`);
  process.stdout.write(`Deploy mode: ${deployMode}\n`);

  if (deployMode === "hook") {
    if (!hookUrl) {
      throw new Error(`Deploy mode is "hook" but ${hookEnvVar} is not set.`);
    }
    try {
      await triggerDeployHook({ hookUrl });
    } catch (error) {
      if (config.deploy?.mode === "auto") {
        process.stdout.write("Deploy hook failed; falling back to API trigger.\n");
        await triggerViaApi({
          token,
          accountId,
          projectName,
          branch,
          hookEnvVar,
          hookUrl,
        });
      } else {
        throw error;
      }
    }
  } else if (deployMode === "api") {
    await triggerViaApi({ token, accountId, projectName, branch, hookEnvVar, hookUrl });
  } else {
    throw new Error(`Unsupported deploy mode "${deployMode}". Use auto, hook, or api.`);
  }

  process.stdout.write("Deployment trigger sent. Waiting for success...\n");
  const deployment = await waitForDeploymentSuccess({
    token,
    accountId,
    projectName,
    branch,
    environment,
    timeoutMs: config.deploy?.timeoutMs,
    pollIntervalMs: config.deploy?.pollIntervalMs,
  });
  process.stdout.write(
    `Deployment success: ${deployment?.url ?? "unknown URL"} (${deployment?.id ?? "unknown id"})\n`,
  );

  if (environment === "production" && !skipVerify) {
    await verifyProduction(config);
  } else if (environment === "production") {
    process.stdout.write("Production verification skipped (--skip-verify).\n");
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
