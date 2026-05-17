import type { LspClient } from "../lsp/client.ts";
import { READY_TIMEOUT_COLD_MS } from "../core/config.ts";
import { log } from "../core/log.ts";

/**
 * Cold-start readiness: wait for ServiceReady (fired once per jdtls process).
 * Returns true if ready, false if timed out (session enters INDEXING state, not failed).
 */
export async function awaitServiceReady(
  client: LspClient,
  timeoutMs = READY_TIMEOUT_COLD_MS,
): Promise<boolean> {
  if (client.isReady) { log.info("jdtls already ready"); return true; }

  log.info("Waiting for jdtls ServiceReady…");

  return Promise.race([
    client.readyPromise.then(() => { log.info("jdtls ServiceReady"); return true; }),
    new Promise<boolean>(res => setTimeout(() => {
      log.warn(`jdtls ServiceReady timeout after ${timeoutMs}ms — will retry on next request`);
      res(false);
    }, timeoutMs)),
  ]);
}
