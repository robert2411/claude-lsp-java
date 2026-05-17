import type { ChildProcess } from "child_process";
import { log } from "../core/log.ts";

export type NotificationHandler = (method: string, params: unknown) => void;
export type RequestHandler = (method: string, params: unknown) => unknown;

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class JsonRpcClient {
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private buf = Buffer.alloc(0);
  private onNotification: NotificationHandler;
  private onServerRequest: RequestHandler;

  constructor(
    private proc: ChildProcess,
    onNotification: NotificationHandler,
    onServerRequest: RequestHandler,
  ) {
    this.onNotification = onNotification;
    this.onServerRequest = onServerRequest;

    proc.stdout!.on("data", (chunk: Buffer) => this.feed(chunk));
    proc.on("exit", () => this.rejectAll("jdtls process exited"));
  }

  private feed(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (true) {
      const msg = this.tryParse();
      if (!msg) break;
      this.dispatch(msg);
    }
  }

  private tryParse(): Record<string, unknown> | null {
    const headerEnd = this.buf.indexOf("\r\n\r\n");
    if (headerEnd === -1) return null;

    const headers = this.buf.subarray(0, headerEnd).toString("ascii");
    const match = headers.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Skip malformed
      this.buf = this.buf.subarray(headerEnd + 4);
      return null;
    }

    const length = parseInt(match[1]);
    const bodyStart = headerEnd + 4;
    if (this.buf.length < bodyStart + length) return null;

    const body = this.buf.subarray(bodyStart, bodyStart + length).toString("utf8");
    this.buf = this.buf.subarray(bodyStart + length);

    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      log.warn(`jsonrpc: failed to parse body: ${body.slice(0, 200)}`);
      return null;
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    if ("id" in msg && "result" in msg) {
      this.resolveRequest(msg.id as number, msg.result);
    } else if ("id" in msg && "error" in msg) {
      const err = msg.error as { message: string };
      this.rejectRequest(msg.id as number, new Error(err?.message ?? "LSP error"));
    } else if ("id" in msg && "method" in msg) {
      // Server → client request
      const result = this.onServerRequest(msg.method as string, msg.params);
      this.sendRaw({ jsonrpc: "2.0", id: msg.id, result: result ?? null });
    } else if ("method" in msg) {
      // Notification
      this.onNotification(msg.method as string, msg.params);
    }
  }

  private resolveRequest(id: number, result: unknown): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(result);
  }

  private rejectRequest(id: number, err: Error): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.reject(err);
  }

  private rejectAll(reason: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(new Error(reason));
    }
  }

  request(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    this.sendRaw(msg);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => { this.pending.delete(id); reject(new Error(`LSP request ${method} timed out`)); },
        timeoutMs,
      );
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method: string, params: unknown): void {
    this.sendRaw({ jsonrpc: "2.0", method, params });
  }

  private sendRaw(msg: unknown): void {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    try {
      this.proc.stdin!.write(header + body);
    } catch (err) {
      log.warn(`jsonrpc: write failed: ${err}`);
    }
  }
}
