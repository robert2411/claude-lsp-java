import { ipcRequest } from "../daemon/autostart.ts";
import type { DiagnosticsResult, DiagnosticSeverity } from "../daemon/protocol.ts";
import { MAX_DIAGNOSTIC_ENTRIES, MAX_ADDITIONAL_CONTEXT_BYTES } from "../core/config.ts";

export async function runHook(): Promise<void> {
  let additionalContext: string;

  try {
    const raw = await readStdin();
    if (!raw.trim()) { exit0(); return; }

    const input = JSON.parse(raw) as {
      tool_name?: string;
      tool_input?: { file_path?: string };
    };

    const filePath = input.tool_input?.file_path;
    if (!filePath?.endsWith(".java")) { exit0(); return; }

    const result = await ipcRequest({ op: "diagnostics", payload: { file_path: filePath } }) as DiagnosticsResult;
    additionalContext = formatDiagnostics(result);
  } catch {
    // Never disrupt Claude's loop
    exit0();
    return;
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(output) + "\n");
  process.exit(0);
}

export function formatDiagnostics(result: DiagnosticsResult): string {
  if (result.status === "indexing") {
    return `Java diagnostics: jdtls is indexing the project (${result.indexingMessage ?? "please wait"}). Diagnostics will be available on the next edit.`;
  }

  if (result.status === "error") {
    return `Java diagnostics: error querying jdtls.`;
  }

  if (!result.diagnostics.length) {
    return `Java diagnostics for ${basename(result.file_path)}: none (clean).`;
  }

  // Dedupe by (code, message, line)
  const seen = new Set<string>();
  const unique = result.diagnostics.filter(d => {
    const key = `${d.code}|${d.message}|${d.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: severity desc (error first), then line
  const severityOrder: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, information: 2, hint: 3 };
  unique.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.line - b.line);

  // Cap at MAX_DIAGNOSTIC_ENTRIES, then byte-cap the string
  const capped = unique.slice(0, MAX_DIAGNOSTIC_ENTRIES);
  const extra = unique.length - capped.length;

  const lines: string[] = [];
  const file = basename(result.file_path);
  const suffix = result.timedOut ? " (diagnostics may be incomplete — jdtls still computing)" : "";
  lines.push(`Java diagnostics for ${file} (${result.diagnostics.length} total)${suffix}:`);

  for (const d of capped) {
    const codeStr = d.code ? ` [${d.code}]` : "";
    lines.push(`  ${d.severity.toUpperCase()} L${d.line + 1}:${d.character + 1}: ${d.message}${codeStr}`);
  }
  if (extra > 0) lines.push(`  (+${extra} more diagnostics)`);

  const full = lines.join("\n");
  if (Buffer.byteLength(full) <= MAX_ADDITIONAL_CONTEXT_BYTES) return full;

  // Byte-cap: drop entries from the end (after header) until it fits
  const header = lines[0];
  const entries = lines.slice(1);
  let result2 = header;
  for (const entry of entries) {
    const candidate = result2 + "\n" + entry;
    if (Buffer.byteLength(candidate) > MAX_ADDITIONAL_CONTEXT_BYTES - 40) {
      const dropped = entries.length - entries.indexOf(entry);
      result2 += `\n  (+${dropped} more diagnostics)`;
      break;
    }
    result2 = candidate;
  }
  return result2;
}

function basename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function exit0(): void { process.exit(0); }
