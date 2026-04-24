import { httpJson } from "./http.mjs";

const CF_API = "https://api.cloudflare.com/client/v4";

function cfHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
  };
}

export async function triggerPagesDeployment({
  token,
  accountId,
  projectName,
  branch = "main",
}) {
  const res = await httpJson(
    `${CF_API}/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      headers: cfHeaders(token),
      body: { branch },
    },
  );
  return res?.result;
}

export async function triggerDeployHook({ hookUrl }) {
  const res = await fetch(hookUrl, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Deploy hook trigger failed (${res.status}). ${text || res.statusText || "No response body"}`,
    );
  }
}

export async function getLatestDeployment({
  token,
  accountId,
  projectName,
  branch = "main",
  environment = "production",
}) {
  const res = await httpJson(
    `${CF_API}/accounts/${accountId}/pages/projects/${projectName}/deployments?env=${environment}&per_page=20`,
    {
      headers: cfHeaders(token),
    },
  );

  const deployments = res?.result || [];
  return deployments.find((d) => d.deployment_trigger?.metadata?.branch === branch) ?? deployments[0];
}

export function deploymentCommitSha(deployment) {
  return (
    deployment?.deployment_trigger?.metadata?.commit_hash ||
    deployment?.deployment_trigger?.metadata?.commit_sha ||
    null
  );
}

export async function waitForDeploymentSuccess({
  token,
  accountId,
  projectName,
  branch = "main",
  environment = "production",
  timeoutMs = 300000,
  pollIntervalMs = 8000,
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deployment = await getLatestDeployment({
      token,
      accountId,
      projectName,
      branch,
      environment,
    });

    const stage = deployment?.latest_stage?.status;
    if (stage === "success") return deployment;
    if (stage === "failure") {
      throw new Error(`Cloudflare deployment failed: ${deployment?.id ?? "unknown deployment"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("Timed out waiting for Cloudflare production deployment.");
}

