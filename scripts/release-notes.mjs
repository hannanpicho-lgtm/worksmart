#!/usr/bin/env node

import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function parseArgs(argv) {
  const out = {
    from: "",
    to: "HEAD",
    limit: 20,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, v = ""] = raw.slice(2).split("=");
    if (k === "from" && v) out.from = v;
    if (k === "to" && v) out.to = v;
    if (k === "limit") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    }
  }
  return out;
}

function classify(subject) {
  const s = subject.toLowerCase();
  if (s.startsWith("feat:")) return "Features";
  if (s.startsWith("fix:")) return "Fixes";
  if (s.startsWith("docs:")) return "Documentation";
  if (s.startsWith("refactor:")) return "Refactors";
  if (s.startsWith("test:")) return "Tests";
  if (s.startsWith("ci:")) return "CI";
  if (s.startsWith("chore:")) return "Chores";
  return "Other";
}

function collectCommits(args) {
  const range = args.from ? `${args.from}..${args.to}` : args.to;
  const limitArg = args.from ? "" : ` -n ${args.limit}`;
  const raw = run(`git log --pretty=format:%H%x09%s${limitArg} ${range}`);
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const [sha, subject = ""] = line.split("\t");
      return { sha, subject };
    })
    .filter((c) => c.sha && c.subject);
}

function render(commits, args) {
  const sectionOrder = ["Features", "Fixes", "Documentation", "Refactors", "Tests", "CI", "Chores", "Other"];
  const grouped = new Map(sectionOrder.map((name) => [name, []]));
  for (const c of commits) {
    grouped.get(classify(c.subject)).push(c);
  }

  const titleRange = args.from ? `${args.from}..${args.to}` : `latest ${args.limit} commits at ${args.to}`;
  const lines = [
    "# Release Notes",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Range: ${titleRange}`,
    `- Commit count: ${commits.length}`,
    "",
  ];

  for (const section of sectionOrder) {
    const items = grouped.get(section) || [];
    if (items.length === 0) continue;
    lines.push(`## ${section}`, "");
    for (const c of items) {
      lines.push(`- ${c.subject} (\`${c.sha.slice(0, 7)}\`)`);
    }
    lines.push("");
  }

  if (commits.length === 0) {
    lines.push("No commits found for the selected range.");
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const commits = collectCommits(args);
  process.stdout.write(`${render(commits, args)}\n`);
}

main();
