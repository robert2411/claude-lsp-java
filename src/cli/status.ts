import { SOCKET_PATH, PID_FILE } from "../core/paths.ts";
import { existsSync, readFileSync } from "fs";

export async function runStatus(): Promise<void> {
  const pidExists = existsSync(PID_FILE);
  const sockExists = existsSync(SOCKET_PATH);

  if (!pidExists && !sockExists) {
    console.log("daemon: not running");
    return;
  }

  let pid: number | null = null;
  if (pidExists) {
    pid = parseInt(readFileSync(PID_FILE, "utf8").trim());
    const alive = isAlive(pid);
    console.log(`daemon: ${alive ? "running" : "stale"} (pid ${pid})`);
  } else {
    console.log("daemon: socket present, no pid file");
  }

  try {
    const conn = await Bun.connect({ unix: SOCKET_PATH, socket: dummySocket() });
    conn.end();
    console.log("socket: reachable");
  } catch {
    console.log("socket: unreachable");
  }
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function dummySocket() {
  return {
    data() {},
    open() {},
    close() {},
    error() {},
    drain() {},
  } as Parameters<typeof Bun.connect>[0]["socket"];
}
