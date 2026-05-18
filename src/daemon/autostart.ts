import type { IpcRequest, IpcResponse } from "./protocol.ts";
import { SOCKET_PATH } from "../core/paths.ts";
import { existsSync, unlinkSync } from "node:fs";
import { log } from "../core/log.ts";
import { selfArgv } from "../util/self.ts";

let nextId = 1;

interface AutostartOptions {
  noAutoStart?: boolean;
}

export async function ipcRequest(
  req: Omit<IpcRequest, "id">,
  opts: AutostartOptions = {},
): Promise<unknown> {
  const id = nextId++;
  const message: IpcRequest = { id, ...req };
  const json = JSON.stringify(message) + "\n";

  let conn: Awaited<ReturnType<typeof Bun.connect>> | null = null;

  const tryConnect = () =>
    Bun.connect({
      unix: SOCKET_PATH,
      socket: {
        data(_s, data) { resolve(data); },
        open() {},
        close() {},
        error(_s, err) { reject(err); },
        drain() {},
      },
    });

  let resolve!: (data: Buffer) => void;
  let reject!: (err: unknown) => void;
  const dataPromise = new Promise<Buffer>((res, rej) => { resolve = res; reject = rej; });

  try {
    conn = await tryConnect();
  } catch (err: unknown) {
    if (opts.noAutoStart) throw err;

    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ECONNREFUSED") {
      if (existsSync(SOCKET_PATH)) {
        try { unlinkSync(SOCKET_PATH); } catch {}
      }
      log.info("daemon not running, auto-starting…");
      await spawnDaemon();
      conn = await tryConnect();
    } else {
      throw err;
    }
  }

  conn.write(json);

  const raw = await dataPromise;
  const resp: IpcResponse = JSON.parse(raw.toString());
  if (!resp.ok) throw new Error(resp.error ?? "IPC error");
  return resp.result;
}

async function spawnDaemon(): Promise<void> {
  const child = Bun.spawn([...selfArgv(), "daemon"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();

  // Poll for socket to appear (backoff: 50ms → 1600ms, max ~8s total)
  let delay = 50;
  let elapsed = 0;
  while (elapsed < 8_000) {
    await new Promise(r => setTimeout(r, delay));
    elapsed += delay;
    delay = Math.min(delay * 2, 1600);
    if (existsSync(SOCKET_PATH)) return;
  }
  throw new Error("daemon did not start within 8s");
}
