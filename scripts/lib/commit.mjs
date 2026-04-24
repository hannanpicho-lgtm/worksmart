export function inferSemanticCommitMessage(files) {
  const normalized = files.map((f) => f.toLowerCase());
  const onlyDocs = normalized.every((f) => f.endsWith(".md") || f.includes("docs/"));
  if (onlyDocs) return "docs: update documentation";

  const hasPipeline =
    normalized.some((f) => f.includes("pipeline")) ||
    normalized.some((f) => f.includes("scripts/lib/"));
  if (hasPipeline) return "chore: update local pipeline automation";

  const hasUi = normalized.some(
    (f) => f.endsWith(".html") || f.endsWith(".css") || f.includes("public/"),
  );
  if (hasUi) return "feat: update site content and presentation";

  const hasConfig = normalized.some(
    (f) =>
      f.endsWith(".json") ||
      f.endsWith(".yml") ||
      f.endsWith(".yaml") ||
      f.includes(".github/"),
  );
  if (hasConfig) return "chore: update configuration";

  return "chore: update project files";
}

