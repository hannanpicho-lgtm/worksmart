import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(lockPath, { staleAfterMs = 15 * 60 * 1000 } = {}) {
  if (existsSync(lockPath)) {
    const existingRaw = readFileSync(lockPath, "utf8");
    let existing = null;
    try {
      existing = JSON.parse(existingRaw);
    } catch {
      existing = null;
    }

    const startedAt = existing?.startedAt ? Date.parse(existing.startedAt) : null;
    const isOld = startedAt ? Date.now() - startedAt > staleAfterMs : true;
    const pid = Number(existing?.pid);
    const pidAlive = Number.isFinite(pid) ? processAlive(pid) : false;

    if (isOld || !pidAlive) {
      rmSync(lockPath, { force: true });
    } else {
      throw new Error(
        `Another pipeline run appears active.\nLock file: ${lockPath}\nLock data: ${existingRaw}\n` +
          "Wait for it to finish, or retry later.",
      );
    }
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

