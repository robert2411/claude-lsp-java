import { ipcRequest } from "../daemon/autostart.ts";
import { findMavenRoot } from "../workspace/detect.ts";
import { resolve } from "path";
import { existsSync } from "fs";

export async function runWarm(pathArg?: string): Promise<void> {
  const targetPath = pathArg ? resolve(pathArg) : process.cwd();

  if (!existsSync(targetPath)) {
    console.error(`Path not found: ${targetPath}`);
    process.exit(1);
  }

  let root: string;
  try {
    root = findMavenRoot(targetPath);
  } catch {
    console.error(`No Maven project found at ${targetPath}`);
    console.error("Run this command from inside a Maven project, or provide a path to one.");
    process.exit(1);
  }

  console.log(`Warming jdtls for Maven root: ${root}`);
  console.log("This may take 30–180s on first run while jdtls imports the project…");

  // The daemon will lazily start jdtls for this root on first request.
  // We send a diagnostics request on a dummy file just to trigger session creation.
  // To track readiness we poll status with a long timeout.
  const dummy = root + "/pom.xml";

  let ready = false;
  const start = Date.now();
  const MAX_WAIT = 180_000;

  process.stdout.write("Waiting for ServiceReady");

  while (!ready && Date.now() - start < MAX_WAIT) {
    try {
      const result = await ipcRequest({ op: "diagnostics", payload: { file_path: dummy } }) as { status: string; indexingMessage?: string };
      if (result.status === "ready") {
        ready = true;
      } else {
        process.stdout.write(".");
        await delay(3000);
      }
    } catch (err) {
      process.stdout.write(".");
      await delay(3000);
    }
  }

  process.stdout.write("\n");

  if (ready) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Ready in ${elapsed}s. First edits will return real diagnostics immediately.`);
  } else {
    console.log("Timed out waiting for ServiceReady. jdtls is still indexing in the background.");
    console.log("First edits will return { status: 'indexing' } until it finishes.");
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
