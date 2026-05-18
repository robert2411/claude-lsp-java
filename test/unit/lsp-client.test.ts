import { describe, it, expect } from "bun:test";
import { EventEmitter } from "events";
import { LspClient } from "../../src/lsp/client.ts";
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

function frame(obj: unknown): Buffer {
  const body = JSON.stringify(obj);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function notification(method: string, params: unknown): Buffer {
  return frame({ jsonrpc: "2.0", method, params });
}

function response(id: number, result: unknown): Buffer {
  return frame({ jsonrpc: "2.0", id, result });
}

function serverRequest(id: number, method: string, params: unknown): Buffer {
  return frame({ jsonrpc: "2.0", id, method, params });
}

describe("LspClient notifications", () => {
  it("handles publishDiagnostics and stores entry", () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    feedData(notification("textDocument/publishDiagnostics", {
      uri: "file:///Foo.java", version: 1,
      diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, severity: 1, message: "error" }],
    }));
    const entry = client.diagnostics.get("file:///Foo.java");
    expect(entry).toBeDefined();
    expect(entry?.diagnostics).toHaveLength(1);
  });

  it("resolves readyPromise on ServiceReady", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    expect(client.isReady).toBe(false);
    feedData(notification("language/status", { type: "ServiceReady", message: "ready" }));
    await client.readyPromise;
    expect(client.isReady).toBe(true);
  });

  it("updates statusMessage on language/status", () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    feedData(notification("language/status", { type: "Starting", message: "Loading…" }));
    expect(client.statusMessage).toBe("Loading…");
  });

  it("calls onStatus listeners", () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const events: Array<{ type: string; message: string }> = [];
    client.onStatus((type, message) => events.push({ type, message }));
    feedData(notification("language/status", { type: "ProjectStatus", message: "indexing" }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ProjectStatus");
  });

  it("ServiceReady only resolves readyResolve once", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    feedData(notification("language/status", { type: "ServiceReady", message: "ready" }));
    await client.readyPromise;
    feedData(notification("language/status", { type: "ServiceReady", message: "ready again" }));
    expect(client.isReady).toBe(true);
  });

  it("resolves readyPromise on progressReport complete", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    feedData(notification("language/progressReport", { complete: true }));
    await client.readyPromise;
    expect(client.isReady).toBe(true);
  });

  it("ignores progressReport when already ready", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    feedData(notification("language/status", { type: "ServiceReady", message: "ready" }));
    await client.readyPromise;
    feedData(notification("language/progressReport", { complete: true }));
    expect(client.isReady).toBe(true);
  });

  it("ignores $/progress notification", () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    expect(() => feedData(notification("$/progress", { token: "t", value: {} }))).not.toThrow();
  });

  it("ignores window/logMessage notification", () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    expect(() => feedData(notification("window/logMessage", { type: 1, message: "debug" }))).not.toThrow();
  });
});

describe("LspClient server request handling", () => {
  it("handles workspace/configuration request", () => {
    const { proc, feedData, written } = makeFakeProc();
    new LspClient(proc);
    feedData(serverRequest(1, "workspace/configuration", {
      items: [{ section: "java.home" }, { section: "editor.tabSize" }],
    }));
    const reply = written.find(w => w.includes('"result"'));
    expect(reply).toBeDefined();
    expect(reply).toContain('"id":1');
  });

  it("handles workspace/applyEdit request", () => {
    const { proc, feedData, written } = makeFakeProc();
    new LspClient(proc);
    feedData(serverRequest(2, "workspace/applyEdit", { edit: {} }));
    const reply = written.find(w => w.includes('"applied"'));
    expect(reply).toBeDefined();
  });

  it("handles client/registerCapability request", () => {
    const { proc, feedData, written } = makeFakeProc();
    new LspClient(proc);
    feedData(serverRequest(3, "client/registerCapability", { registrations: [] }));
    expect(written.length).toBeGreaterThan(0);
  });

  it("handles window/workDoneProgress/create request", () => {
    const { proc, feedData, written } = makeFakeProc();
    new LspClient(proc);
    feedData(serverRequest(4, "window/workDoneProgress/create", { token: "t" }));
    expect(written.length).toBeGreaterThan(0);
  });

  it("handles unknown server request gracefully", () => {
    const { proc, feedData, written } = makeFakeProc();
    new LspClient(proc);
    feedData(serverRequest(5, "unknown/method", {}));
    const reply = written.find(w => w.includes('"id":5'));
    expect(reply).toBeDefined();
  });
});

describe("LspClient document management", () => {
  it("openDoc sends didOpen notification", () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    client.openDoc("/tmp/test/Foo.java");
    expect(written.some(w => w.includes("textDocument/didOpen"))).toBe(true);
    expect(written.some(w => w.includes("Foo.java"))).toBe(true);
  });

  it("openDoc is idempotent — does not send second open for same file", () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    client.openDoc("/tmp/test/Foo.java");
    const countBefore = written.filter(w => w.includes("textDocument/didOpen")).length;
    client.openDoc("/tmp/test/Foo.java");
    const countAfter = written.filter(w => w.includes("textDocument/didOpen")).length;
    expect(countAfter).toBe(countBefore);
  });

  it("changeDoc sends didChange and didSave", () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    client.openDoc("/tmp/test/Foo.java");
    written.length = 0;
    client.changeDoc("/tmp/test/Foo.java");
    expect(written.some(w => w.includes("textDocument/didChange"))).toBe(true);
    expect(written.some(w => w.includes("textDocument/didSave"))).toBe(true);
  });

  it("changeDoc increments version on each call", () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    client.openDoc("/tmp/test/Foo.java");
    const { version: v1 } = client.changeDoc("/tmp/test/Foo.java");
    const { version: v2 } = client.changeDoc("/tmp/test/Foo.java");
    expect(v2).toBeGreaterThan(v1);
  });

  it("closeDoc sends didClose", () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    client.openDoc("/tmp/test/Foo.java");
    written.length = 0;
    client.closeDoc("/tmp/test/Foo.java");
    expect(written.some(w => w.includes("textDocument/didClose"))).toBe(true);
  });

  it("closeDoc is a no-op if doc was never opened", () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    expect(() => client.closeDoc("/tmp/test/NotOpened.java")).not.toThrow();
    expect(written.some(w => w.includes("textDocument/didClose"))).toBe(false);
  });
});

describe("LspClient hover", () => {
  it("returns null contents when response is null", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.hover("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, null));
    const result = await p;
    expect(result.contents).toBeNull();
  });

  it("extracts string hover contents", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.hover("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, { contents: "some docs", range: null }));
    const result = await p;
    expect(result.contents).toBe("some docs");
  });

  it("extracts MarkupContent hover contents", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.hover("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, { contents: { kind: "markdown", value: "**hover**" } }));
    const result = await p;
    expect(result.contents).toBe("**hover**");
  });

  it("extracts array hover contents joined with separators", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.hover("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, { contents: ["line1", { value: "line2" }] }));
    const result = await p;
    expect(result.contents).toContain("line1");
    expect(result.contents).toContain("line2");
    expect(result.contents).toContain("---");
  });

  it("returns JSON for unexpected hover content shape", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.hover("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, { contents: 42 }));
    const result = await p;
    expect(typeof result.contents).toBe("string");
  });
});

describe("LspClient definition", () => {
  it("returns empty array when result is null", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.definition("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, null));
    const result = await p;
    expect(result.locations).toHaveLength(0);
  });

  it("returns locations from array result", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.definition("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, [
      { uri: "file:///Bar.java", range: { start: { line: 5, character: 2 }, end: { line: 5, character: 10 } } },
    ]));
    const result = await p;
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].line).toBe(5);
    expect(result.locations[0].file_path).toContain("Bar.java");
  });

  it("returns location from single object result", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.definition("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, { uri: "file:///Baz.java", range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } } }));
    const result = await p;
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].line).toBe(10);
  });
});

describe("LspClient references", () => {
  it("returns references locations", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.references("/tmp/test/Foo.java", 1, 0, true);
    feedData(response(1, [
      { uri: "file:///Ref.java", range: { start: { line: 3, character: 1 }, end: { line: 3, character: 6 } } },
    ]));
    const result = await p;
    expect(result.locations).toHaveLength(1);
  });

  it("returns empty when null", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.references("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, null));
    const result = await p;
    expect(result.locations).toHaveLength(0);
  });
});

describe("LspClient completion", () => {
  it("returns items from list object", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.completion("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, {
      items: [{ label: "println", kind: 2, detail: "void println()" }],
    }));
    const result = await p;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe("println");
    expect(result.items[0].kind).toBe("Method");
  });

  it("returns items from plain array", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.completion("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, [{ label: "size", kind: 6 }]));
    const result = await p;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("Variable");
  });

  it("returns empty items when null", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.completion("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, null));
    const result = await p;
    expect(result.items).toHaveLength(0);
  });

  it("uses label as insertText when insertText absent", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.completion("/tmp/test/Foo.java", 1, 0);
    feedData(response(1, [{ label: "myMethod" }]));
    const result = await p;
    expect(result.items[0].insertText).toBe("myMethod");
  });
});

describe("LspClient documentSymbols", () => {
  it("returns empty for null result", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.documentSymbols("/tmp/test/Foo.java");
    feedData(response(1, null));
    const result = await p;
    expect(result.symbols).toHaveLength(0);
  });

  it("returns empty for empty array", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.documentSymbols("/tmp/test/Foo.java");
    feedData(response(1, []));
    const result = await p;
    expect(result.symbols).toHaveLength(0);
  });

  it("maps hierarchical symbols (with selectionRange)", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.documentSymbols("/tmp/test/Foo.java");
    feedData(response(1, [{
      name: "MyClass",
      kind: 5,
      range: { start: { line: 0, character: 0 }, end: { line: 100, character: 1 } },
      selectionRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 13 } },
      children: [
        {
          name: "myMethod",
          kind: 6,
          range: { start: { line: 5, character: 2 }, end: { line: 10, character: 3 } },
          selectionRange: { start: { line: 5, character: 9 }, end: { line: 5, character: 17 } },
        },
      ],
    }]));
    const result = await p;
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe("MyClass");
    expect(result.symbols[0].kind).toBe("Class");
    expect(result.symbols[0].children).toHaveLength(1);
    expect(result.symbols[0].children![0].name).toBe("myMethod");
  });

  it("maps flat symbols (without selectionRange)", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.documentSymbols("/tmp/test/Foo.java");
    feedData(response(1, [{
      name: "MyClass",
      kind: 5,
      location: { uri: "file:///Foo.java", range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } } },
    }]));
    const result = await p;
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe("MyClass");
    expect(result.symbols[0].kind).toBe("Class");
  });
});

describe("LspClient workspaceSymbols", () => {
  it("returns empty when null", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.workspaceSymbols("Foo");
    feedData(response(1, null));
    const result = await p;
    expect(result.symbols).toHaveLength(0);
  });

  it("returns mapped symbols", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.workspaceSymbols("Foo");
    feedData(response(1, [{
      name: "FooService",
      kind: 5,
      containerName: "com.example",
      location: { uri: "file:///FooService.java", range: { start: { line: 0, character: 0 }, end: { line: 50, character: 1 } } },
    }]));
    const result = await p;
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe("FooService");
    expect(result.symbols[0].container).toBe("com.example");
    expect(result.symbols[0].kind).toBe("Class");
  });
});

describe("LspClient rename", () => {
  it("returns empty changes when null", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.rename("/tmp/test/Foo.java", 1, 0, "Bar");
    feedData(response(1, null));
    const result = await p;
    expect(result.changes).toHaveLength(0);
    expect(result.applied).toBe(false);
  });

  it("maps changes from changes map", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.rename("/tmp/test/Foo.java", 1, 0, "Bar");
    feedData(response(1, {
      changes: {
        "file:///Foo.java": [
          { range: { start: { line: 1, character: 6 }, end: { line: 1, character: 9 } }, newText: "Bar" },
        ],
      },
    }));
    const result = await p;
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].edits).toHaveLength(1);
    expect(result.changes[0].edits[0].newText).toBe("Bar");
  });

  it("maps changes from documentChanges array", async () => {
    const { proc, feedData } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.rename("/tmp/test/Foo.java", 1, 0, "Bar");
    feedData(response(1, {
      documentChanges: [{
        textDocument: { uri: "file:///Foo.java" },
        edits: [{ range: { start: { line: 2, character: 4 }, end: { line: 2, character: 7 } }, newText: "Bar" }],
      }],
    }));
    const result = await p;
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].edits[0].newText).toBe("Bar");
  });
});

describe("LspClient initialize", () => {
  it("sends initialize request and initialized notification", async () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    const p = client.initialize("file:///workspace", []);
    feedData(response(1, { capabilities: {} }));
    await p;
    expect(written.some(w => w.includes('"initialize"'))).toBe(true);
    expect(written.some(w => w.includes('"initialized"'))).toBe(true);
  });

  it("includes runtimes in initializationOptions", async () => {
    const { proc, feedData, written } = makeFakeProc();
    const client = new LspClient(proc);
    const runtimes = [{ name: "JavaSE-21", path: "/usr/lib/jvm/java-21" }];
    const p = client.initialize("file:///workspace", runtimes);
    feedData(response(1, { capabilities: {} }));
    await p;
    expect(written.some(w => w.includes("JavaSE-21"))).toBe(true);
  });
});
