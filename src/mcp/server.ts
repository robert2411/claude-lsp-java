import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ipcRequest } from "../daemon/autostart.ts";
import { log } from "../core/log.ts";

type IpcOp = Parameters<typeof ipcRequest>[0]["op"];

async function callIpc(op: IpcOp, args: Record<string, unknown>) {
  try {
    const result = await ipcRequest({ op, payload: args });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

const filePos = {
  file_path: z.string().describe("Absolute path to the .java file"),
  line: z.number().describe("0-based line number"),
  character: z.number().describe("0-based character offset"),
};

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: "java-lsp", version: "0.1.0" });

  server.registerTool("java_diagnostics",
    {
      description: "Get Java compiler and type diagnostics for a file. First call after startup may return status='indexing' while jdtls imports the project.",
      inputSchema: { file_path: z.string().describe("Absolute path to the .java file") },
    },
    (args) => callIpc("diagnostics", args),
  );

  server.registerTool("java_hover",
    {
      description: "Get hover information (javadoc, type signature) for a symbol at a position.",
      inputSchema: filePos,
    },
    (args) => callIpc("hover", args),
  );

  server.registerTool("java_definition",
    {
      description: "Go to the definition of a symbol (class, method, field) at a position.",
      inputSchema: filePos,
    },
    (args) => callIpc("definition", args),
  );

  server.registerTool("java_references",
    {
      description: "Find all references to a symbol at a position across the workspace.",
      inputSchema: { ...filePos, include_declaration: z.boolean().optional().describe("Include the declaration itself") },
    },
    (args) => callIpc("references", args),
  );

  server.registerTool("java_completion",
    {
      description: "Get code completion suggestions at a position (up to 100 items).",
      inputSchema: filePos,
    },
    (args) => callIpc("completion", args),
  );

  server.registerTool("java_document_symbols",
    {
      description: "List all symbols (classes, methods, fields) in a Java file.",
      inputSchema: { file_path: z.string().describe("Absolute path to the .java file") },
    },
    (args) => callIpc("documentSymbols", args),
  );

  server.registerTool("java_workspace_symbols",
    {
      description: "Search for symbols across the entire Maven workspace by name query.",
      inputSchema: {
        query: z.string().describe("Symbol name search query (can be partial)"),
        file_path: z.string().optional().describe("Optional: a file to anchor the workspace root"),
      },
    },
    (args) => callIpc("workspaceSymbols", args),
  );

  server.registerTool("java_rename",
    {
      description: "Compute rename edits for a symbol. Returns changes to apply — does NOT modify files. Apply with the Edit tool.",
      inputSchema: { ...filePos, new_name: z.string().describe("New name for the symbol") },
    },
    (args) => callIpc("rename", args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server running on stdio");
}
