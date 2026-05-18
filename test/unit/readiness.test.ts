import { describe, it, expect } from "bun:test";
import { awaitServiceReady } from "../../src/jdtls/readiness.ts";

function makeMockClient(alreadyReady: boolean, resolveAfterMs?: number) {
  let readyResolve: () => void;
  const readyPromise = new Promise<void>(r => { readyResolve = r; });

  if (resolveAfterMs !== undefined) {
    setTimeout(() => readyResolve(), resolveAfterMs);
  }

  return {
    isReady: alreadyReady,
    readyPromise,
    statusMessage: "",
    onStatus: () => {},
    diagnostics: null as unknown as never,
    rpc: null as unknown as never,
  };
}

describe("awaitServiceReady", () => {
  it("returns true immediately when client is already ready", async () => {
    const client = makeMockClient(true);
    const result = await awaitServiceReady(client as never, 1000);
    expect(result).toBe(true);
  });

  it("returns true when readyPromise resolves before timeout", async () => {
    const client = makeMockClient(false, 50);
    const result = await awaitServiceReady(client as never, 2000);
    expect(result).toBe(true);
  });

  it("returns false when readyPromise does not resolve before timeout", async () => {
    const client = makeMockClient(false);
    const result = await awaitServiceReady(client as never, 50);
    expect(result).toBe(false);
  });
});
