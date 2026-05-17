import { platform, arch } from "os";

const targets = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
] as const;

const current = `bun-${platform() === "darwin" ? "darwin" : "linux"}-${arch() === "arm64" ? "arm64" : "x64"}`;

// Default: build current platform only. Pass --all to build all targets.
const all = process.argv.includes("--all");
const buildTargets = all ? targets : [current];

for (const target of buildTargets) {
  const outfile = `dist/claude-java-lsp-${target.replace("bun-", "")}`;
  console.log(`Building ${target} → ${outfile}`);
  const proc = Bun.spawn(
    ["bun", "build", "./src/index.ts", "--compile", "--minify", `--target=${target}`, `--outfile=${outfile}`],
    { stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`Build failed for ${target}`);
    process.exit(code);
  }
}

console.log("Build complete.");
