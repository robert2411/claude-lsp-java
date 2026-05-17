import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { JDTLS_DIR } from "../core/paths.ts";
import { JDTLS_VERSION, JDTLS_MILESTONE_BASE } from "../core/config.ts";
import { sha256File } from "../util/sha256.ts";
import { log } from "../core/log.ts";
import { platform, arch } from "os";

interface JdtlsLayout {
  launcherJar: string;
  configDir: string;
}

export function getJdtlsLayout(): JdtlsLayout | null {
  const versionDir = join(JDTLS_DIR, JDTLS_VERSION);
  const launcher = findLauncherJar(versionDir);
  const config = platformConfigDir(versionDir);
  if (!launcher || !config) return null;
  return { launcherJar: launcher, configDir: config };
}

export async function bootstrapJdtls(force = false): Promise<JdtlsLayout> {
  const versionDir = join(JDTLS_DIR, JDTLS_VERSION);

  if (!force) {
    const existing = getJdtlsLayout();
    if (existing) {
      log.info(`jdtls ${JDTLS_VERSION} already cached`);
      return existing;
    }
  }

  log.info(`Downloading jdtls ${JDTLS_VERSION}…`);
  mkdirSync(versionDir, { recursive: true });

  // Fetch the milestone directory listing to find the exact tarball name
  const listing = await fetch(JDTLS_MILESTONE_BASE);
  if (!listing.ok) throw new Error(`Failed to fetch milestone listing: ${listing.status}`);
  const html = await listing.text();

  const tarballs = [...html.matchAll(/href="(jdt-language-server-[\d.]+-\d+\.tar\.gz)"/g)]
    .map(m => m[1]);
  if (tarballs.length === 0) throw new Error(`No jdtls tarball found at ${JDTLS_MILESTONE_BASE}`);

  const tarball = tarballs[0];
  const tarUrl = JDTLS_MILESTONE_BASE + tarball;
  const sha256Url = tarUrl + ".sha256";

  log.info(`Fetching ${tarball}…`);
  const [tarResp, shaResp] = await Promise.all([fetch(tarUrl), fetch(sha256Url)]);
  if (!tarResp.ok) throw new Error(`Download failed: ${tarResp.status}`);
  if (!shaResp.ok) throw new Error(`SHA256 download failed: ${shaResp.status}`);

  const expectedSha = (await shaResp.text()).trim().split(/\s+/)[0];
  const tarData = await tarResp.arrayBuffer();

  const tmpDir = join(JDTLS_DIR, "download.tmp");
  const tmpFile = join(tmpDir, tarball);
  mkdirSync(tmpDir, { recursive: true });

  await Bun.write(tmpFile, tarData);

  // Verify checksum
  const actualSha = sha256File(tmpFile);
  if (actualSha !== expectedSha) {
    unlinkSync(tmpFile);
    throw new Error(`SHA256 mismatch: expected ${expectedSha}, got ${actualSha}`);
  }

  log.info("Checksum verified, extracting…");
  try {
    execSync(`tar -xzf "${tmpFile}" -C "${versionDir}"`, { stdio: "pipe" });
    unlinkSync(tmpFile);
  } catch (err) {
    throw new Error(`Extraction failed: ${err}`);
  }

  const layout = getJdtlsLayout();
  if (!layout) throw new Error("jdtls extracted but launcher jar not found");
  log.info("jdtls bootstrap complete");
  return layout;
}

function findLauncherJar(dir: string): string | null {
  const pluginsDir = join(dir, "plugins");
  if (!existsSync(pluginsDir)) return null;
  try {
    const { readdirSync } = require("fs") as typeof import("fs");
    const files = readdirSync(pluginsDir);
    const jar = files.find(f => f.startsWith("org.eclipse.equinox.launcher_") && f.endsWith(".jar"));
    return jar ? join(pluginsDir, jar) : null;
  } catch {
    return null;
  }
}

function platformConfigDir(dir: string): string | null {
  const os = platform();
  const cpu = arch();

  const candidates: string[] = [];
  if (os === "darwin") {
    if (cpu === "arm64") candidates.push("config_mac_arm", "config_mac");
    else candidates.push("config_mac");
  } else if (os === "win32") {
    candidates.push("config_win");
  } else {
    candidates.push("config_linux");
  }

  for (const c of candidates) {
    const full = join(dir, c);
    if (existsSync(full)) return full;
  }
  return null;
}
