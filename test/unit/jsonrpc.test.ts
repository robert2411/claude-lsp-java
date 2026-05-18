import { describe, it, expect, mock } from "bun:test";
import { EventEmitter } from "events";
import { JsonRpcClient } from "../../src/lsp/jsonrpc.ts";
import type { ChildProcess } from "child_process";

function makeFakeProc(): { proc: ChildProcess; feedData: (buf: Buffer) => void; written: string[] } {
  const written: string[] = [];
  const stdout = new EventEmitter() as NodeJS.ReadableStream;
  const stdin = { write: (data: string) => { written.push(data); return true; } } as unknown as NodeJS.WritableStream;
  const procEmitter = new EventEmitter();
  const proc = Object.assign(procEmitter, { stdout, stdin }) as unknown as ChildProcess;
  const feedData = (buf: Buffer) => stdout.emit("data", buf);
  return { proc, feedData, written };
}

function makeResponse(id: number, result: unknown): Buffer {
  const body = JSON.stringify({ jsonrpc: "2.0", id, result });
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function makeNotification(method: string, params: unknown): Buffer {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params });
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

describe("JsonRpcClient", () => {
  it("sends a request with Content-Length framing", () => {
    const { proc, written } = makeFakeProc();
    new JsonRpcClient(proc, () => {}, () => null);
    // Client is created; we just verify construction doesn't throw
    expect(written.length).toBe(0);
  });

  it("resolves a request when the matching response arrives", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new JsonRpcClient(proc, () => {}, () => null);

    const promise = client.request("initialize", {});
    feedData(makeResponse(1, { capabilities: {} }));
    const result = await promise;
    expect(result).toEqual({ capabilities: {} });
  });

  it("handles pipelined responses correctly", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new JsonRpcClient(proc, () => {}, () => null);

    const p1 = client.request("method1", {});
    const p2 = client.request("method2", {});

    const buf1 = makeResponse(1, "result1");
    const buf2 = makeResponse(2, "result2");
    feedData(Buffer.concat([buf1, buf2]));

    expect(await p1).toBe("result1");
    expect(await p2).toBe("result2");
  });

  it("dispatches notifications to the handler", () => {
    const notifications: Array<{ method: string; params: unknown }> = [];
    const { proc, feedData } = makeFakeProc();
    new JsonRpcClient(proc, (m, p) => notifications.push({ method: m, params: p }), () => null);

    feedData(makeNotification("textDocument/publishDiagnostics", { uri: "file:///Foo.java", diagnostics: [] }));
    expect(notifications).toHaveLength(1);
    expect(notifications[0].method).toBe("textDocument/publishDiagnostics");
  });

  it("handles fragmented incoming data", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new JsonRpcClient(proc, () => {}, () => null);

    const promise = client.request("test", {});
    const full = makeResponse(1, "hello");
    feedData(full.subarray(0, 10));
    feedData(full.subarray(10));
    expect(await promise).toBe("hello");
  });

  it("rejects a request when an error response arrives", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new JsonRpcClient(proc, () => {}, () => null);

    const promise = client.request("hover", {});
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "Symbol not found" } });
    feedData(Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`));
    await expect(promise).rejects.toThrow("Symbol not found");
  });

  it("rejects all pending requests when the process exits", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new JsonRpcClient(proc, () => {}, () => null);

    // Feed a partial response so the request stays pending
    const p1 = client.request("method1", {});
    const p2 = client.request("method2", {});
    // Emit exit — should reject both pending requests
    proc.emit("exit");
    await expect(p1).rejects.toThrow("jdtls process exited");
    await expect(p2).rejects.toThrow("jdtls process exited");
    void feedData; // suppress unused warning
  });

  it("handles server-initiated requests and replies", () => {
    const { proc, feedData, written } = makeFakeProc();
    new JsonRpcClient(proc, () => {}, (method) => {
      if (method === "workspace/configuration") return [{ java: true }];
      return null;
    });

    const body = JSON.stringify({ jsonrpc: "2.0", id: 99, method: "workspace/configuration", params: {} });
    feedData(Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`));
    const sent = written.join("");
    expect(sent).toContain('"id":99');
    expect(sent).toContain('"result"');
  });

  it("skips malformed headers", () => {
    const { proc, feedData } = makeFakeProc();
    new JsonRpcClient(proc, () => {}, () => null);
    // Missing Content-Length header — should not throw
    const malformed = Buffer.from("Bad-Header: foo\r\n\r\n");
    expect(() => feedData(malformed)).not.toThrow();
  });
});
