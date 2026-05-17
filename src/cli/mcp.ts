import { startMcpServer } from "../mcp/server.ts";

export async function runMcp(): Promise<void> {
  await startMcpServer();
}
