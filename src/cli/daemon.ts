import { startDaemon } from "../daemon/server.ts";

export async function runDaemon(): Promise<void> {
  await startDaemon();
  // Keep the process alive
  await new Promise(() => {});
}
