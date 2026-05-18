import { describe, it, expect } from "bun:test";
import { symbolKindName, completionKindName } from "../../src/lsp/types.ts";

describe("symbolKindName", () => {
  it("returns correct name for File (1)", () => expect(symbolKindName(1)).toBe("File"));
  it("returns correct name for Class (5)", () => expect(symbolKindName(5)).toBe("Class"));
  it("returns correct name for Method (6)", () => expect(symbolKindName(6)).toBe("Method"));
  it("returns correct name for Field (8)", () => expect(symbolKindName(8)).toBe("Field"));
  it("returns correct name for Constructor (9)", () => expect(symbolKindName(9)).toBe("Constructor"));
  it("returns correct name for Interface (11)", () => expect(symbolKindName(11)).toBe("Interface"));
  it("returns correct name for Enum (10)", () => expect(symbolKindName(10)).toBe("Enum"));
  it("returns correct name for Variable (13)", () => expect(symbolKindName(13)).toBe("Variable"));
  it("returns correct name for TypeParameter (26)", () => expect(symbolKindName(26)).toBe("TypeParameter"));
  it("returns Unknown for unrecognized kind", () => expect(symbolKindName(999)).toBe("Unknown"));
  it("returns Unknown for 0", () => expect(symbolKindName(0)).toBe("Unknown"));
});

describe("completionKindName", () => {
  it("returns correct name for Text (1)", () => expect(completionKindName(1)).toBe("Text"));
  it("returns correct name for Method (2)", () => expect(completionKindName(2)).toBe("Method"));
  it("returns correct name for Function (3)", () => expect(completionKindName(3)).toBe("Function"));
  it("returns correct name for Field (5)", () => expect(completionKindName(5)).toBe("Field"));
  it("returns correct name for Variable (6)", () => expect(completionKindName(6)).toBe("Variable"));
  it("returns correct name for Class (7)", () => expect(completionKindName(7)).toBe("Class"));
  it("returns correct name for Keyword (14)", () => expect(completionKindName(14)).toBe("Keyword"));
  it("returns correct name for Snippet (15)", () => expect(completionKindName(15)).toBe("Snippet"));
  it("returns correct name for TypeParameter (25)", () => expect(completionKindName(25)).toBe("TypeParameter"));
  it("returns Unknown for unrecognized kind", () => expect(completionKindName(999)).toBe("Unknown"));
  it("returns Unknown for 0", () => expect(completionKindName(0)).toBe("Unknown"));
});
