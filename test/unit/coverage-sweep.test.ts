/**
 * Imports remaining source modules to cover their module-level initialization
 * code in the coverage report.  Each test just asserts the import succeeded
 * so that the file appears in lcov with its module-level lines counted.
 */
import { describe, it, expect } from "bun:test";

describe("module import sweep", () => {
  it("imports cli/daemon", async () => {
    const mod = await import("../../src/cli/daemon.ts");
    expect(typeof mod.runDaemon).toBe("function");
  });

  it("imports cli/mcp", async () => {
    const mod = await import("../../src/cli/mcp.ts");
    expect(typeof mod.runMcp).toBe("function");
  });

  it("imports cli/stop", async () => {
    const mod = await import("../../src/cli/stop.ts");
    expect(typeof mod.runStop).toBe("function");
  });

  it("imports cli/warm", async () => {
    const mod = await import("../../src/cli/warm.ts");
    expect(typeof mod.runWarm).toBe("function");
  });

  it("imports cli/status", async () => {
    const mod = await import("../../src/cli/status.ts");
    expect(typeof mod.runStatus).toBe("function");
  });

  it("imports cli/install", async () => {
    const mod = await import("../../src/cli/install.ts");
    expect(typeof mod.runInstall).toBe("function");
  });

  it("imports cli/uninstall", async () => {
    const mod = await import("../../src/cli/uninstall.ts");
    expect(typeof mod.runUninstall).toBe("function");
  });

  it("imports daemon/server", async () => {
    const mod = await import("../../src/daemon/server.ts");
    expect(typeof mod.startDaemon).toBe("function");
  });

  it("imports jdtls/launch", async () => {
    const mod = await import("../../src/jdtls/launch.ts");
    expect(typeof mod.launchJdtls).toBe("function");
  });

  it("imports mcp/server", async () => {
    const mod = await import("../../src/mcp/server.ts");
    expect(typeof mod.startMcpServer).toBe("function");
  });

  it("imports daemon/autostart", async () => {
    const mod = await import("../../src/daemon/autostart.ts");
    expect(typeof mod.ipcRequest).toBe("function");
  });
});
