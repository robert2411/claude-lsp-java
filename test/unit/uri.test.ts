import { describe, it, expect } from "bun:test";
import { fileToUri, uriToFile } from "../../src/util/uri.ts";

describe("uri", () => {
  it("converts absolute path to file URI", () => {
    const uri = fileToUri("/home/user/project/Foo.java");
    expect(uri).toStartWith("file://");
    expect(uri).toContain("Foo.java");
  });

  it("round-trips path through URI", () => {
    const path = "/home/user/project/src/Foo.java";
    const uri = fileToUri(path);
    const back = uriToFile(uri);
    expect(back).toBe(path);
  });

  it("passes through non-file URIs unchanged", () => {
    expect(uriToFile("jdt://contents/...")).toBe("jdt://contents/...");
  });
});
