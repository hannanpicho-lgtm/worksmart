import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readPipelineConfig() {
  const cfgPath = resolve(process.cwd(), "pipeline.config.json");
  if (!existsSync(cfgPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch {
    return {};
  }
}

export function resolveSyncTarget() {
  const config = readPipelineConfig();
  const remote = config.sync?.remote ?? "origin";
  const base = config.sync?.baseBranch ?? config.defaultBaseBranch ?? "main";
  return { remote, base, target: `${remote}/${base}` };
}
