import { describe, it, expect } from "bun:test";
import { formatDiagnostics } from "../../src/cli/hook.ts";
import type { DiagnosticsResult } from "../../src/daemon/protocol.ts";

const mkDiag = (severity: "error" | "warning" | "information" | "hint", line: number, message: string, code?: string): DiagnosticsResult["diagnostics"][0] => ({
  severity,
  line,
  character: 0,
  endLine: line,
  endCharacter: 10,
  message,
  code,
});

describe("formatDiagnostics — status branches", () => {
  it("returns indexing message when status is indexing", () => {
    const result: DiagnosticsResult = {
      status: "indexing",
      file_path: "/tmp/Foo.java",
      diagnostics: [],
      indexingMessage: "Building project…",
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("indexing");
    expect(out).toContain("Building project…");
  });

  it("uses fallback when indexingMessage is absent", () => {
    const result: DiagnosticsResult = {
      status: "indexing",
      file_path: "/tmp/Foo.java",
      diagnostics: [],
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("please wait");
  });

  it("returns error message when status is error", () => {
    const result: DiagnosticsResult = {
      status: "error",
      file_path: "/tmp/Foo.java",
      diagnostics: [],
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("error querying jdtls");
  });

  it("returns clean message when no diagnostics", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/project/Foo.java",
      diagnostics: [],
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("Foo.java");
    expect(out).toContain("none (clean)");
  });
});

describe("formatDiagnostics — formatting diagnostics", () => {
  it("formats a single error diagnostic", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [mkDiag("error", 4, "cannot find symbol", "1001")],
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("Foo.java");
    expect(out).toContain("ERROR");
    expect(out).toContain("L5:1");
    expect(out).toContain("cannot find symbol");
    expect(out).toContain("[1001]");
  });

  it("omits code bracket when code is absent", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [mkDiag("warning", 0, "unused import")],
    };
    const out = formatDiagnostics(result);
    expect(out).not.toContain("[");
  });

  it("sorts errors before warnings before information", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [
        mkDiag("information", 1, "info msg"),
        mkDiag("error", 5, "error msg"),
        mkDiag("warning", 3, "warn msg"),
      ],
    };
    const out = formatDiagnostics(result);
    const errorPos = out.indexOf("error msg");
    const warnPos = out.indexOf("warn msg");
    const infoPos = out.indexOf("info msg");
    expect(errorPos).toBeLessThan(warnPos);
    expect(warnPos).toBeLessThan(infoPos);
  });

  it("sorts by line number within same severity", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [
        mkDiag("error", 10, "error at 10"),
        mkDiag("error", 2, "error at 2"),
        mkDiag("error", 6, "error at 6"),
      ],
    };
    const out = formatDiagnostics(result);
    const pos2 = out.indexOf("error at 2");
    const pos6 = out.indexOf("error at 6");
    const pos10 = out.indexOf("error at 10");
    expect(pos2).toBeLessThan(pos6);
    expect(pos6).toBeLessThan(pos10);
  });

  it("deduplicates diagnostics with same code+message+line", () => {
    const diag = mkDiag("error", 1, "dup error", "E1");
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [diag, { ...diag }, { ...diag }],
    };
    const out = formatDiagnostics(result);
    const count = (out.match(/dup error/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("includes timedOut suffix when timedOut is true", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [mkDiag("error", 0, "err")],
      timedOut: true,
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("still computing");
  });

  it("caps at MAX_DIAGNOSTIC_ENTRIES and shows overflow count", () => {
    const diagnostics: DiagnosticsResult["diagnostics"] = [];
    for (let i = 0; i < 40; i++) {
      diagnostics.push(mkDiag("error", i, `error ${i}`));
    }
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics,
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("more diagnostics");
  });

  it("applies byte cap and appends overflow message", () => {
    const diagnostics: DiagnosticsResult["diagnostics"] = [];
    const longMsg = "X".repeat(500);
    for (let i = 0; i < 20; i++) {
      diagnostics.push(mkDiag("error", i, longMsg));
    }
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics,
    };
    const out = formatDiagnostics(result);
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(8_100);
    expect(out).toContain("more diagnostics");
  });

  it("returns full output without truncation for small payloads", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [mkDiag("error", 0, "small error")],
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("small error");
    expect(out).not.toContain("more diagnostics");
  });

  it("uses file basename not full path in header", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/very/long/path/to/Foo.java",
      diagnostics: [],
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("Foo.java");
    expect(out).not.toContain("/very/long/path/to/");
  });

  it("handles hint severity", () => {
    const result: DiagnosticsResult = {
      status: "ready",
      file_path: "/tmp/Foo.java",
      diagnostics: [mkDiag("hint", 0, "hint message")],
    };
    const out = formatDiagnostics(result);
    expect(out).toContain("HINT");
  });
});
