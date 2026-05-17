// LSP type definitions used by the JSON-RPC client

export interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number; // 1=Error 2=Warning 3=Information 4=Hint
  code?: string | number;
  source?: string;
  message: string;
  relatedInformation?: unknown[];
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: LspDiagnostic[];
}

export interface LanguageStatusParams {
  type: string;   // "Starting" | "Started" | "ServiceReady" | "ProjectStatus"
  message: string;
}

export interface ProgressReportParams {
  id?: string;
  task?: string;
  subTask?: string;
  status?: string;
  totalWork?: number;
  workDone?: number;
  complete?: boolean;
}

export interface LspLocation {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface LspSymbol {
  name: string;
  kind: number;
  location: LspLocation;
  containerName?: string;
}

export interface LspDocumentSymbol {
  name: string;
  kind: number;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
  children?: LspDocumentSymbol[];
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  insertText?: string;
  sortText?: string;
}

export interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{ textDocument: { uri: string }; edits: LspTextEdit[] }>;
}

export interface LspTextEdit {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
}

// Numeric symbol kinds -> readable strings
const SYMBOL_KINDS: Record<number, string> = {
  1: "File", 2: "Module", 3: "Namespace", 4: "Package",
  5: "Class", 6: "Method", 7: "Property", 8: "Field",
  9: "Constructor", 10: "Enum", 11: "Interface", 12: "Function",
  13: "Variable", 14: "Constant", 15: "String", 16: "Number",
  17: "Boolean", 18: "Array", 19: "Object", 20: "Key",
  21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event",
  25: "Operator", 26: "TypeParameter",
};
export function symbolKindName(k: number): string { return SYMBOL_KINDS[k] ?? "Unknown"; }

const COMPLETION_KINDS: Record<number, string> = {
  1: "Text", 2: "Method", 3: "Function", 4: "Constructor", 5: "Field",
  6: "Variable", 7: "Class", 8: "Interface", 9: "Module", 10: "Property",
  11: "Unit", 12: "Value", 13: "Enum", 14: "Keyword", 15: "Snippet",
  16: "Color", 17: "File", 18: "Reference", 19: "Folder",
  20: "EnumMember", 21: "Constant", 22: "Struct", 23: "Event",
  24: "Operator", 25: "TypeParameter",
};
export function completionKindName(k: number): string { return COMPLETION_KINDS[k] ?? "Unknown"; }
