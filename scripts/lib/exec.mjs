import { spawnSync } from "node:child_process";

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: options.stdio ?? "pipe",
    cwd: options.cwd,
  });

  if (options.allowFailure) return result;

  if (result.status !== 0) {
    const message =
      result.error?.message ||
      result.stderr?.trim() ||
      result.stdout?.trim() ||
      `Command failed (${result.status ?? "unknown"}).`;
    throw new Error(`${command} ${args.join(" ")}\n${message}`);
  }
  return result;
}

export function runShell(commandText, options = {}) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", commandText], {
      ...options,
      shell: false,
    });
  }
  return run("bash", ["-lc", commandText], { ...options, shell: false });
}

