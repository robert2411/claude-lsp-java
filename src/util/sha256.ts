import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256File(path: string): string {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

export function sha256String(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
