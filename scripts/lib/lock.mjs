import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export function acquireLock(lockPath) {
  if (existsSync(lockPath)) {
    const existing = readFileSync(lockPath, "utf8");
    throw new Error(
      `Another pipeline run appears active.\nLock file: ${lockPath}\nLock data: ${existing}\n` +
        "If this is stale, delete the lock file and retry.",
    );
  }
  writeFileSync(
    lockPath,
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function releaseLock(lockPath) {
  if (existsSync(lockPath)) {
    rmSync(lockPath, { force: true });
  }
}

