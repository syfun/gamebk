import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function build() {
  execFileSync("make", ["build"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    stdio: "inherit",
  });
}
