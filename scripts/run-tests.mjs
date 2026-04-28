#!/usr/bin/env node

import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

function collectTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectTests(full, out);
      continue;
    }
    if (name.endsWith(".test.mjs")) {
      out.push(full);
    }
  }
  return out;
}

const testsDir = resolve(process.cwd(), "tests");
const files = collectTests(testsDir).sort();

if (files.length === 0) {
  console.error("No test files found under tests/");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
