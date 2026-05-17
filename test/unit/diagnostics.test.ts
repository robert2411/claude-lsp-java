import { describe, it, expect } from "bun:test";
import { DiagnosticsStore } from "../../src/lsp/diagnostics.ts";
import type { LspDiagnostic } from "../../src/lsp/types.ts";

const errorDiag: LspDiagnostic = {
  range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
  severity: 1,
  message: "cannot find symbol",
  code: "1",
};

describe("DiagnosticsStore", () => {
  it("stores and retrieves diagnostics", () => {
    const store = new DiagnosticsStore();
    store.publish("file:///Foo.java", 1, [errorDiag]);
    const entry = store.get("file:///Foo.java");
    expect(entry?.diagnostics).toHaveLength(1);
    expect(entry?.diagnostics[0].message).toBe("cannot find symbol");
  });

  it("waitForFresh resolves when qualifying publish arrives", async () => {
    const store = new DiagnosticsStore();
    const sinceTs = Date.now();
    const promise = store.waitForFresh("file:///Foo.java", 2, sinceTs, 50, 2000);
    setTimeout(() => store.publish("file:///Foo.java", 2, [errorDiag]), 30);
    const { entry, timedOut } = await promise;
    expect(timedOut).toBe(false);
    expect(entry?.diagnostics[0].message).toBe("cannot find symbol");
  });

  it("waitForFresh ignores stale publishes (old version)", async () => {
    const store = new DiagnosticsStore();
    // Pre-populate with old version
    store.publish("file:///Foo.java", 1, [errorDiag]);
    const sinceTs = Date.now();
    const promise = store.waitForFresh("file:///Foo.java", 3, sinceTs, 50, 300);
    const { entry, timedOut } = await promise;
    expect(timedOut).toBe(true); // old version 1 < required 3, should not resolve
  });

  it("waitForFresh times out and returns best-so-far", async () => {
    const store = new DiagnosticsStore();
    const sinceTs = Date.now();
    const promise = store.waitForFresh("file:///Foo.java", 1, sinceTs, 50, 200);
    setTimeout(() => store.publish("file:///Foo.java", 1, [errorDiag]), 80);
    const { entry, timedOut } = await promise;
    // Should resolve via settle window well before 200ms timeout
    expect(timedOut).toBe(false);
    expect(entry?.diagnostics).toHaveLength(1);
  });
});
