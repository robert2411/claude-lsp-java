export const JDTLS_VERSION = "1.58.0";
export const JDTLS_MILESTONE_BASE = `https://download.eclipse.org/jdtls/milestones/${JDTLS_VERSION}/`;
export const JDTLS_SNAPSHOT_URL = "https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz";
export const JDTLS_MIN_JAVA_VERSION = 21;

export const DAEMON_IDLE_MS = parseInt(process.env.DAEMON_IDLE_MS ?? "") || 30 * 60 * 1000;
export const READY_TIMEOUT_COLD_MS = parseInt(process.env.READY_TIMEOUT_COLD_MS ?? "") || 180_000;
export const READY_TIMEOUT_HOOK_MS = parseInt(process.env.READY_TIMEOUT_HOOK_MS ?? "") || 8_000;
export const HOOK_HARD_TIMEOUT_MS = parseInt(process.env.HOOK_HARD_TIMEOUT_MS ?? "") || 6_000;
export const SETTLE_MS = parseInt(process.env.SETTLE_MS ?? "") || 450;

export const MAX_DIAGNOSTIC_ENTRIES = 30;
export const MAX_ADDITIONAL_CONTEXT_BYTES = 8_000;

export const JDTLS_JVM_ARGS = [
  "-Declipse.application=org.eclipse.jdt.ls.core.id1",
  "-Dosgi.bundles.defaultStartLevel=4",
  "-Declipse.product=org.eclipse.jdt.ls.core.product",
  "-Dlog.level=ALL",
  "-Xms256m",
  "-Xmx2G",
  "--add-modules=ALL-SYSTEM",
  "--add-opens=java.base/java.util=ALL-UNNAMED",
  "--add-opens=java.base/java.lang=ALL-UNNAMED",
];
