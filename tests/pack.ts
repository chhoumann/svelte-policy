import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The oxlint tests run the built package, so every test run builds it first. */
export default function pack(): void {
  const vp = fileURLToPath(new URL("../node_modules/vite-plus/bin/vp", import.meta.url));
  execFileSync(process.execPath, [vp, "pack"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "pipe",
  });
}
