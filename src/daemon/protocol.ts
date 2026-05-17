export type DiagnosticSeverity = "error" | "warning" | "information" | "hint";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  message: string;
  code?: string | number;
  source?: string;
}

export interface Position { line: number; character: number; }
export interface Range { start: Position; end: Position; }

export interface Location {
  file_path: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  container?: string;
  file_path?: string;
  line: number;
  character: number;
  endLine?: number;
  endCharacter?: number;
  children?: SymbolInfo[];
}

export interface TextEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  newText: string;
}

export interface FileEdits {
  file_path: string;
  edits: TextEdit[];
}

// Request types
export type IpcOp =
  | "ping"
  | "diagnostics"
  | "hover"
  | "definition"
  | "references"
  | "completion"
  | "documentSymbols"
  | "workspaceSymbols"
  | "rename"
  | "status"
  | "shutdown";

export interface IpcRequest {
  id: number;
  op: IpcOp;
  payload: Record<string, unknown>;
}

export interface IpcResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// Response payload shapes
export interface DiagnosticsResult {
  status: "ready" | "indexing" | "error";
  file_path: string;
  uri?: string;
  diagnostics: Diagnostic[];
  indexingMessage?: string;
  timedOut?: boolean;
}

export interface HoverResult { contents: string | null; range?: Range; }
export interface DefinitionResult { locations: Location[]; }
export interface ReferencesResult { locations: Location[]; }

export interface CompletionItem {
  label: string;
  kind: string;
  detail?: string;
  insertText?: string;
  sortText?: string;
}
export interface CompletionResult { items: CompletionItem[]; }
export interface DocumentSymbolsResult { symbols: SymbolInfo[]; }
export interface WorkspaceSymbolsResult { symbols: SymbolInfo[]; }
export interface RenameResult { changes: FileEdits[]; applied: false; }
