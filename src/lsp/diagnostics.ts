import type { LspDiagnostic } from "./types.ts";

interface DiagnosticsEntry {
  version: number | undefined; // undefined when jdtls omits the version field
  receivedAt: number;
  diagnostics: LspDiagnostic[];
}

export class DiagnosticsStore {
  private store = new Map<string, DiagnosticsEntry>();
  // Listeners waiting for fresh diagnostics for a URI
  private listeners = new Map<string, Array<(entry: DiagnosticsEntry) => void>>();

  publish(uri: string, version: number | undefined, diagnostics: LspDiagnostic[]): void {
    const entry: DiagnosticsEntry = {
      version,
      receivedAt: Date.now(),
      diagnostics,
    };
    this.store.set(uri, entry);

    const waiters = this.listeners.get(uri);
    if (waiters?.length) {
      for (const cb of waiters) cb(entry);
    }
  }

  get(uri: string): DiagnosticsEntry | undefined {
    return this.store.get(uri);
  }

  /**
   * Wait for a publishDiagnostics that arrived AFTER sinceTs and has version >= sinceVersion.
   * Uses a settle window: resets whenever a new qualifying publish arrives, resolves after settleMs quiet.
   * Hard cap at timeoutMs; on timeout returns best-so-far.
   */
  waitForFresh(
    uri: string,
    sinceVersion: number,
    sinceTs: number,
    settleMs: number,
    timeoutMs: number,
  ): Promise<{ entry: DiagnosticsEntry | undefined; timedOut: boolean }> {
    return new Promise(resolve => {
      let best: DiagnosticsEntry | undefined;
      let settleTimer: ReturnType<typeof setTimeout> | null = null;

      const hardTimer = setTimeout(() => {
        cleanup();
        resolve({ entry: best, timedOut: true });
      }, timeoutMs);

      // Qualify if arrived after the send AND (version matches OR jdtls omitted version)
      const qualify = (entry: DiagnosticsEntry) =>
        entry.receivedAt >= sinceTs &&
        (entry.version === undefined || entry.version >= sinceVersion);

      const settle = () => {
        cleanup();
        resolve({ entry: best, timedOut: false });
      };

      const cb = (entry: DiagnosticsEntry) => {
        if (!qualify(entry)) return;
        best = entry;
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, settleMs);
      };

      const cleanup = () => {
        clearTimeout(hardTimer);
        if (settleTimer) clearTimeout(settleTimer);
        const arr = this.listeners.get(uri);
        if (arr) {
          const idx = arr.indexOf(cb);
          if (idx !== -1) arr.splice(idx, 1);
        }
      };

      // Check if we already have a qualifying entry
      const existing = this.store.get(uri);
      if (existing && qualify(existing)) {
        best = existing;
        settleTimer = setTimeout(settle, settleMs);
      }

      if (!this.listeners.has(uri)) this.listeners.set(uri, []);
      this.listeners.get(uri)!.push(cb);
    });
  }
}
