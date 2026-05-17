import type { IpcOp } from "../daemon/protocol.ts";

interface ToolDef {
  name: string;
  description: string;
  op: IpcOp;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "java_diagnostics",
    op: "diagnostics",
    description: "Get Java compiler and type diagnostics for a file. First call after startup may return status='indexing' while jdtls imports the project.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .java file" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "java_hover",
    op: "hover",
    description: "Get hover information (javadoc, type signature) for a symbol at a position.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .java file" },
        line: { type: "number", description: "0-based line number" },
        character: { type: "number", description: "0-based character offset" },
      },
      required: ["file_path", "line", "character"],
    },
  },
  {
    name: "java_definition",
    op: "definition",
    description: "Go to the definition of a symbol (class, method, field) at a position.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .java file" },
        line: { type: "number", description: "0-based line number" },
        character: { type: "number", description: "0-based character offset" },
      },
      required: ["file_path", "line", "character"],
    },
  },
  {
    name: "java_references",
    op: "references",
    description: "Find all references to a symbol at a position across the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .java file" },
        line: { type: "number", description: "0-based line number" },
        character: { type: "number", description: "0-based character offset" },
        include_declaration: { type: "boolean", description: "Include the declaration itself" },
      },
      required: ["file_path", "line", "character"],
    },
  },
  {
    name: "java_completion",
    op: "completion",
    description: "Get code completion suggestions at a position (up to 100 items).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .java file" },
        line: { type: "number", description: "0-based line number" },
        character: { type: "number", description: "0-based character offset" },
      },
      required: ["file_path", "line", "character"],
    },
  },
  {
    name: "java_document_symbols",
    op: "documentSymbols",
    description: "List all symbols (classes, methods, fields) in a Java file.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .java file" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "java_workspace_symbols",
    op: "workspaceSymbols",
    description: "Search for symbols across the entire Maven workspace by name query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Symbol name search query (can be partial)" },
        file_path: { type: "string", description: "Optional: a file to anchor the workspace root" },
      },
      required: ["query"],
    },
  },
  {
    name: "java_rename",
    op: "rename",
    description: "Compute rename edits for a symbol. Returns changes to apply — does NOT modify files. Apply with the Edit tool.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .java file" },
        line: { type: "number", description: "0-based line number" },
        character: { type: "number", description: "0-based character offset" },
        new_name: { type: "string", description: "New name for the symbol" },
      },
      required: ["file_path", "line", "character", "new_name"],
    },
  },
];
