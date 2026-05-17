import { ipcRequest } from "../daemon/autostart.ts";

export async function runStop(): Promise<void> {
  try {
    await ipcRequest({ op: "shutdown", payload: {} }, { noAutoStart: true });
    console.log("daemon stopped");
  } catch {
    console.log("daemon was not running");
  }
}
