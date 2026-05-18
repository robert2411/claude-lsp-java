import type { ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { JsonRpcClient } from "./jsonrpc.ts";
import { DiagnosticsStore } from "./diagnostics.ts";
import { fileToUri, uriToFile } from "../util/uri.ts";
import { symbolKindName, completionKindName } from "./types.ts";
import type {
  PublishDiagnosticsParams, LanguageStatusParams,
  ProgressReportParams, LspLocation, LspSymbol, LspDocumentSymbol,
  LspCompletionItem, LspWorkspaceEdit,
} from "./types.ts";
import type {
  HoverResult, DefinitionResult, ReferencesResult,
  CompletionResult, DocumentSymbolsResult, WorkspaceSymbolsResult,
  RenameResult, Location, SymbolInfo, FileEdits,
} from "../daemon/protocol.ts";
import { log } from "../core/log.ts";

export type StatusListener = (type: string, message: string) => void;

export class LspClient {
  readonly diagnostics = new DiagnosticsStore();
  private readonly rpc: JsonRpcClient;
  private readonly docVersions = new Map<string, number>();
  private readonly statusListeners: StatusListener[] = [];

  // Readiness (cold start)
  private _ready = false;
  private readyResolve?: () => void;
  readonly readyPromise: Promise<void>;
  private latestStatusMsg = "";

  constructor(proc: ChildProcess) {
    this.readyPromise = new Promise(res => { this.readyResolve = res; });
    this.rpc = new JsonRpcClient(proc, this.handleNotification.bind(this), this.handleServerRequest.bind(this));
  }

  get isReady(): boolean { return this._ready; }
  get statusMessage(): string { return this.latestStatusMsg; }

  onStatus(fn: StatusListener): void { this.statusListeners.push(fn); }

  private handleNotification(method: string, params: unknown): void {
    if (method === "textDocument/publishDiagnostics") {
      const p = params as PublishDiagnosticsParams;
      this.diagnostics.publish(p.uri, p.version, p.diagnostics);
    } else if (method === "language/status") {
      const p = params as LanguageStatusParams;
      this.latestStatusMsg = p.message;
      for (const fn of this.statusListeners) fn(p.type, p.message);
      if (p.type === "ServiceReady" && !this._ready) {
        this._ready = true;
        this.readyResolve?.();
      }
    } else if (method === "language/progressReport") {
      const p = params as ProgressReportParams;
      if (p.complete && !this._ready) {
        this._ready = true;
        this.readyResolve?.();
      }
    } else if (method === "$/progress") {
      // Ignore; handled via language/progressReport
    } else if (method === "window/logMessage") {
      // Suppress for now
    }
  }

  private handleServerRequest(method: string, params: unknown): unknown {
    if (method === "workspace/configuration") {
      const p = params as { items: Array<{ section?: string }> };
      return p.items.map(item => (item.section?.startsWith("java") ? {} : null));
    }
    if (method === "workspace/applyEdit") return { applied: true };
    if (method === "client/registerCapability") return {};
    if (method === "window/workDoneProgress/create") return {};
    log.debug(`unhandled server request: ${method}`);
    return null;
  }

  async initialize(rootUri: string, runtimes: Array<{ name: string; path: string; default?: boolean }>): Promise<void> {
    const extraVmArgs = process.env.CLAUDE_JAVA_LSP_VMARGS?.split(" ").filter(Boolean) ?? [];

    await this.rpc.request("initialize", {
      processId: process.pid,
      rootUri,
      rootPath: uriToFile(rootUri),
      workspaceFolders: [{ uri: rootUri, name: "workspace" }],
      capabilities: {
        textDocument: {
          publishDiagnostics: { versionSupport: true, relatedInformation: true },
          hover: { contentFormat: ["plaintext", "markdown"] },
          definition: { linkSupport: false },
          references: {},
          completion: { completionItem: { snippetSupport: false } },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          rename: { prepareSupport: true },
        },
        workspace: {
          applyEdit: true,
          workspaceEdit: { documentChanges: true },
          symbol: {},
          configuration: true,
        },
      },
      initializationOptions: {
        bundles: [],
        workspaceFolders: [rootUri],
        extendedClientCapabilities: {
          progressReportProvider: true,
          classFileContentsSupport: true,
        },
        settings: {
          java: {
            import: { maven: { enabled: true }, gradle: { enabled: false } },
            autobuild: { enabled: true },
            configuration: {
              updateBuildConfiguration: "automatic",
              runtimes,
            },
            jdt: { ls: { vmargs: extraVmArgs.join(" ") || "" } },
          },
        },
      },
    }, 30_000);

    this.rpc.notify("initialized", {});
  }

  // Document management
  openDoc(filePath: string): void {
    const uri = fileToUri(filePath);
    if (this.docVersions.has(uri)) return;
    const text = tryRead(filePath);
    const version = 1;
    this.docVersions.set(uri, version);
    this.rpc.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "java", version, text },
    });
  }

  changeDoc(filePath: string): { uri: string; version: number; sendTs: number } {
    const uri = fileToUri(filePath);
    const text = tryRead(filePath);
    const version = (this.docVersions.get(uri) ?? 0) + 1;
    this.docVersions.set(uri, version);
    const sendTs = Date.now();
    this.rpc.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
    this.rpc.notify("textDocument/didSave", {
      textDocument: { uri },
      text,
    });
    return { uri, version, sendTs };
  }

  closeDoc(filePath: string): void {
    const uri = fileToUri(filePath);
    if (!this.docVersions.has(uri)) return;
    this.docVersions.delete(uri);
    this.rpc.notify("textDocument/didClose", { textDocument: { uri } });
  }

  // LSP requests
  async hover(filePath: string, line: number, character: number): Promise<HoverResult> {
    const uri = fileToUri(filePath);
    const result = await this.rpc.request("textDocument/hover", {
      textDocument: { uri }, position: { line, character },
    }) as { contents: unknown; range?: unknown } | null;
    if (!result) return { contents: null };
    return {
      contents: extractMarkdown(result.contents),
      range: result.range as HoverResult["range"],
    };
  }

  async definition(filePath: string, line: number, character: number): Promise<DefinitionResult> {
    const uri = fileToUri(filePath);
    const result = await this.rpc.request("textDocument/definition", {
      textDocument: { uri }, position: { line, character },
    });
    return { locations: lspLocations(result) };
  }

  async references(filePath: string, line: number, character: number, includeDeclaration = false): Promise<ReferencesResult> {
    const uri = fileToUri(filePath);
    const result = await this.rpc.request("textDocument/references", {
      textDocument: { uri }, position: { line, character },
      context: { includeDeclaration },
    });
    return { locations: lspLocations(result) };
  }

  async completion(filePath: string, line: number, character: number): Promise<CompletionResult> {
    const uri = fileToUri(filePath);
    const result = await this.rpc.request("textDocument/completion", {
      textDocument: { uri }, position: { line, character },
    }) as { items?: LspCompletionItem[] } | LspCompletionItem[] | null;

    const items = Array.isArray(result) ? result : (result?.items ?? []);
    return {
      items: items.slice(0, 100).map(i => ({
        label: i.label,
        kind: completionKindName(i.kind ?? 0),
        detail: i.detail,
        insertText: i.insertText ?? i.label,
        sortText: i.sortText,
      })),
    };
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbolsResult> {
    const uri = fileToUri(filePath);
    const result = await this.rpc.request("textDocument/documentSymbol", {
      textDocument: { uri },
    }) as LspDocumentSymbol[] | LspSymbol[] | null;

    if (!result || result.length === 0) return { symbols: [] };

    // Hierarchical (LspDocumentSymbol) vs flat (LspSymbol)
    if ("selectionRange" in (result[0] as object)) {
      return { symbols: mapDocSymbols(result as LspDocumentSymbol[]) };
    }
    return { symbols: (result as LspSymbol[]).map(s => ({
      name: s.name,
      kind: symbolKindName(s.kind),
      line: s.location.range.start.line,
      character: s.location.range.start.character,
    })) };
  }

  async workspaceSymbols(query: string): Promise<WorkspaceSymbolsResult> {
    const result = await this.rpc.request("workspace/symbol", { query }) as LspSymbol[] | null;
    if (!result) return { symbols: [] };
    return {
      symbols: result.map(s => ({
        name: s.name,
        kind: symbolKindName(s.kind),
        container: s.containerName,
        file_path: uriToFile(s.location.uri),
        line: s.location.range.start.line,
        character: s.location.range.start.character,
      })),
    };
  }

  async rename(filePath: string, line: number, character: number, newName: string): Promise<RenameResult> {
    const uri = fileToUri(filePath);
    const result = await this.rpc.request("textDocument/rename", {
      textDocument: { uri }, position: { line, character }, newName,
    }) as LspWorkspaceEdit | null;

    if (!result) return { changes: [], applied: false };
    return { changes: mapWorkspaceEdit(result), applied: false };
  }
}

// --- Helpers ---

function tryRead(filePath: string): string {
  try { return readFileSync(filePath, "utf8"); } catch { return ""; }
}

function lspLocations(result: unknown): Location[] {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  return (arr as LspLocation[]).map(l => ({
    file_path: uriToFile(l.uri),
    line: l.range.start.line,
    character: l.range.start.character,
    endLine: l.range.end.line,
    endCharacter: l.range.end.character,
  }));
}

function extractMarkdown(contents: unknown): string | null {
  if (!contents) return null;
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) return (contents as Array<{ value?: string } | string>).map(c => typeof c === "string" ? c : (c.value ?? "")).join("\n---\n");
  if (typeof contents === "object" && contents !== null && "value" in contents) return (contents as { value: string }).value;
  return JSON.stringify(contents);
}

function mapDocSymbols(syms: LspDocumentSymbol[]): SymbolInfo[] {
  return syms.map(s => ({
    name: s.name,
    kind: symbolKindName(s.kind),
    line: s.selectionRange.start.line,
    character: s.selectionRange.start.character,
    endLine: s.range.end.line,
    endCharacter: s.range.end.character,
    children: s.children ? mapDocSymbols(s.children) : undefined,
  }));
}

function mapWorkspaceEdit(edit: LspWorkspaceEdit): FileEdits[] {
  const result: FileEdits[] = [];

  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      result.push({
        file_path: uriToFile(uri),
        edits: edits.map(e => ({
          startLine: e.range.start.line, startCharacter: e.range.start.character,
          endLine: e.range.end.line, endCharacter: e.range.end.character,
          newText: e.newText,
        })),
      });
    }
  }

  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      result.push({
        file_path: uriToFile(dc.textDocument.uri),
        edits: dc.edits.map(e => ({
          startLine: e.range.start.line, startCharacter: e.range.start.character,
          endLine: e.range.end.line, endCharacter: e.range.end.character,
          newText: e.newText,
        })),
      });
    }
  }

  return result;
}
