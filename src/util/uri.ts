import { realpathSync } from "node:fs";

export function fileToUri(path: string): string {
  const real = tryRealpath(path);
  return "file://" + real;
}

export function uriToFile(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  return decodeURIComponent(uri.slice(7));
}

function tryRealpath(p: string): string {
  try { return realpathSync(p); } catch { return p; }
}
