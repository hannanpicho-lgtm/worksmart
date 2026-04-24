import { httpJson } from "./http.mjs";

const GH_API = "https://api.github.com";

export function parseGitHubRepo(remoteUrl) {
  if (remoteUrl.startsWith("git@github.com:")) {
    const repo = remoteUrl.replace("git@github.com:", "").replace(/\.git$/, "");
    const [owner, name] = repo.split("/");
    return { owner, repo: name };
  }
  if (remoteUrl.startsWith("https://github.com/")) {
    const repo = remoteUrl.replace("https://github.com/", "").replace(/\.git$/, "");
    const [owner, name] = repo.split("/");
    return { owner, repo: name };
  }
  throw new Error(`Unsupported remote URL for GitHub parsing: ${remoteUrl}`);
}

function ghHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
}

export async function upsertPr({
  token,
  owner,
  repo,
  headBranch,
  baseBranch,
  title,
  body,
}) {
  const pulls = await httpJson(
    `${GH_API}/repos/${owner}/${repo}/pulls?head=${owner}:${headBranch}&state=open`,
    { headers: ghHeaders(token) },
  );

  if (pulls.length > 0) {
    const pr = pulls[0];
    await httpJson(`${GH_API}/repos/${owner}/${repo}/pulls/${pr.number}`, {
      method: "PATCH",
      headers: ghHeaders(token),
      body: { title, body, base: baseBranch },
    });
    return { number: pr.number, html_url: pr.html_url, updated: true };
  }

  const created = await httpJson(`${GH_API}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: ghHeaders(token),
    body: {
      title,
      body,
      head: headBranch,
      base: baseBranch,
    },
  });

  return { number: created.number, html_url: created.html_url, updated: false };
}

export async function mergePr({ token, owner, repo, pullNumber, method = "squash" }) {
  await httpJson(`${GH_API}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
    method: "PUT",
    headers: ghHeaders(token),
    body: { merge_method: method },
  });
}

