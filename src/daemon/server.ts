import { mkdirSync, writeFileSync, existsSync, unlinkSync, createWriteStream } from "fs";
import { dirname } from "path";
import type { Socket } from "bun";
import { SOCKET_PATH, PID_FILE, LOGS_DIR, DAEMON_LOG } from "../core/paths.ts";
import { setLogFile, log } from "../core/log.ts";
import { DAEMON_IDLE_MS, READY_TIMEOUT_HOOK_MS, HOOK_HARD_TIMEOUT_MS, SETTLE_MS } from "../core/config.ts";
import { findMavenRoot } from "../workspace/detect.ts";
import { launchJdtls } from "../jdtls/launch.ts";
import { awaitServiceReady } from "../jdtls/readiness.ts";
import { fileToUri, uriToFile } from "../util/uri.ts";
import { symbolKindName } from "../lsp/types.ts";
import type { LspClient } from "../lsp/client.ts";
import type { IpcRequest, IpcResponse, DiagnosticsResult, Diagnostic, DiagnosticSeverity } from "./protocol.ts";
import type { LspDiagnostic } from "../lsp/types.ts";
import type { ChildProcess } from "child_process";

type SessionState = "STARTING" | "INDEXING" | "READY" | "DEAD";

interface Session {
  proc: ChildProcess;
  client: LspClient;
  rootUri: string;
  state: SessionState;
  readyPromise: Promise<void>;
  lastUsed: number;
  queue: Promise<unknown>;
}

const sessions = new Map<string, Session>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let logStream: ReturnType<typeof createWriteStream> | null = null;

export async function startDaemon(): Promise<void> {
  mkdirSync(LOGS_DIR, { recursive: true });
  mkdirSync(dirname(SOCKET_PATH), { recursive: true });

  logStream = createWriteStream(DAEMON_LOG, { flags: "a" });
  setLogFile(DAEMON_LOG);

  // Stale socket cleanup
  if (existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }

  writeFileSync(PID_FILE, String(process.pid));
  process.on("exit", cleanup);
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", () => { cleanup(); process.exit(0); });

  const server = Bun.listen<Buffer[]>({
    unix: SOCKET_PATH,
    socket: {
      open(socket) { socket.data = []; },
      data(socket, chunk) {
        socket.data.push(chunk);
        const buf = Buffer.concat(socket.data).toString();
        const lines = buf.split("\n");
        // Process all complete lines, keep last incomplete chunk
        const incomplete = lines.pop() ?? "";
        socket.data = incomplete ? [Buffer.from(incomplete)] : [];
        for (const line of lines) {
          if (line.trim()) handleRequest(socket, line);
        }
      },
      close() {},
      error(_s, err) { log.warn(`socket error: ${err}`); },
      drain() {},
    },
  });

  log.info(`daemon started (pid ${process.pid}), socket: ${SOCKET_PATH}`);
  resetIdleTimer();
}

async function handleRequest(socket: Socket<Buffer[]>, line: string): Promise<void> {
  let req: IpcRequest;
  try { req = JSON.parse(line); } catch {
    reply(socket, { id: 0, ok: false, error: "invalid JSON" });
    return;
  }

  try {
    const result = await dispatch(req);
    reply(socket, { id: req.id, ok: true, result });
  } catch (err) {
    reply(socket, { id: req.id, ok: false, error: String(err instanceof Error ? err.message : err) });
  }
}

function reply(socket: Socket<Buffer[]>, resp: IpcResponse): void {
  try { socket.write(JSON.stringify(resp) + "\n"); } catch {}
}

async function dispatch(req: IpcRequest): Promise<unknown> {
  resetIdleTimer();

  if (req.op === "ping") return "pong";
  if (req.op === "shutdown") { setImmediate(shutdownAll); return "ok"; }
  if (req.op === "status") return buildStatus();

  const file = req.payload.file_path as string | undefined;
  if (!file) throw new Error("file_path required");

  const rootPath = findMavenRoot(file);
  const session = await getOrCreateSession(rootPath);

  if (req.op === "diagnostics") return runDiagnostics(session, file);

  // Other ops require READY state
  if (session.state !== "READY") {
    const ready = await Promise.race([
      session.readyPromise.then(() => true),
      new Promise<boolean>(r => setTimeout(() => r(false), READY_TIMEOUT_HOOK_MS)),
    ]);
    if (!ready) return { status: "indexing", indexingMessage: session.client.statusMessage };
  }

  session.client.openDoc(file);

  switch (req.op) {
    case "hover": return session.client.hover(file, req.payload.line as number, req.payload.character as number);
    case "definition": return session.client.definition(file, req.payload.line as number, req.payload.character as number);
    case "references": return session.client.references(file, req.payload.line as number, req.payload.character as number, Boolean(req.payload.include_declaration));
    case "completion": return session.client.completion(file, req.payload.line as number, req.payload.character as number);
    case "documentSymbols": return session.client.documentSymbols(file);
    case "workspaceSymbols": return session.client.workspaceSymbols(String(req.payload.query ?? ""));
    case "rename": return session.client.rename(file, req.payload.line as number, req.payload.character as number, String(req.payload.new_name));
    default: throw new Error(`unknown op: ${req.op}`);
  }
}

async function runDiagnostics(session: Session, filePath: string): Promise<DiagnosticsResult> {
  // If not ready, wait briefly
  if (session.state !== "READY") {
    const ready = await Promise.race([
      session.readyPromise.then(() => true),
      new Promise<boolean>(r => setTimeout(() => r(false), READY_TIMEOUT_HOOK_MS)),
    ]);
    if (!ready) {
      return {
        status: "indexing",
        file_path: filePath,
        diagnostics: [],
        indexingMessage: session.client.statusMessage || "jdtls is indexing the project…",
      };
    }
  }

  // Sync the file and wait for fresh diagnostics
  session.client.openDoc(filePath);
  const { uri, version, sendTs } = session.client.changeDoc(filePath);

  const { entry, timedOut } = await session.client.diagnostics.waitForFresh(
    uri, version, sendTs, SETTLE_MS, HOOK_HARD_TIMEOUT_MS,
  );

  const raw = entry?.diagnostics ?? [];
  return {
    status: "ready",
    file_path: filePath,
    uri,
    diagnostics: raw.map(mapDiagnostic),
    timedOut,
  };
}

function mapDiagnostic(d: LspDiagnostic): Diagnostic {
  const severityMap: Record<number, DiagnosticSeverity> = {
    1: "error", 2: "warning", 3: "information", 4: "hint",
  };
  return {
    severity: severityMap[d.severity ?? 1] ?? "error",
    line: d.range.start.line,
    character: d.range.start.character,
    endLine: d.range.end.line,
    endCharacter: d.range.end.character,
    message: d.message,
    code: d.code,
    source: d.source,
  };
}

async function getOrCreateSession(rootPath: string): Promise<Session> {
  const existing = sessions.get(rootPath);
  if (existing && existing.state !== "DEAD") return existing;

  log.info(`Creating jdtls session for ${rootPath}`);

  let readyResolve!: () => void;
  const readyPromise = new Promise<void>(r => { readyResolve = r; });

  const session: Session = {
    proc: null as unknown as ChildProcess,
    client: null as unknown as LspClient,
    rootUri: fileToUri(rootPath),
    state: "STARTING",
    readyPromise,
    lastUsed: Date.now(),
    queue: Promise.resolve(),
  };
  sessions.set(rootPath, session);

  try {
    const { proc, client } = await launchJdtls(rootPath, logStream);
    session.proc = proc;
    session.client = client;

    proc.on("exit", () => {
      session.state = "DEAD";
      log.warn(`jdtls process died for ${rootPath}`);
    });

    // Cold-start readiness
    awaitServiceReady(client).then(ready => {
      session.state = ready ? "READY" : "INDEXING";
      readyResolve();
      if (!ready) {
        // Keep waiting in background; transition to READY when it fires
        client.readyPromise.then(() => { session.state = "READY"; });
      }
    });
  } catch (err) {
    session.state = "DEAD";
    sessions.delete(rootPath);
    throw err;
  }

  return session;
}

function buildStatus(): unknown {
  const s: Record<string, string> = {};
  for (const [root, session] of sessions) {
    s[root] = session.state;
  }
  return { pid: process.pid, sessions: s };
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(shutdownAll, DAEMON_IDLE_MS);
}

function shutdownAll(): void {
  log.info("daemon shutting down");
  for (const [root, session] of sessions) {
    try { session.proc.kill(); } catch {}
  }
  sessions.clear();
  cleanup();
  process.exit(0);
}

function cleanup(): void {
  try { unlinkSync(SOCKET_PATH); } catch {}
  try { unlinkSync(PID_FILE); } catch {}
}
