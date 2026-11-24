import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as base } from "@playwright/test";

const host = "127.0.0.1";
const binary = fileURLToPath(new URL("../../dist/gamebk", import.meta.url));

function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, host, () => {
      const { port } = socket.address();
      socket.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export const test = base.extend({
  gamebk: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "gamebk-browser-"));
    try {
      const saveDir = join(directory, "saves");
      const backupRoot = join(directory, "backups");
      await Promise.all([mkdir(saveDir), mkdir(backupRoot)]);
      const port = await availablePort();
      const baseURL = `http://${host}:${port}`;
      const server = spawn(binary, [], {
        cwd: directory,
        env: {
          ...process.env,
          GAMEBK_HOST: host,
          GAMEBK_PORT: String(port),
          GAMEBK_DB_PATH: join(directory, "gamebk.db"),
          GIN_MODE: "release",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const closed = new Promise((resolve) => server.once("close", resolve));
      let log = "";
      let startError;
      server.stdout.on("data", (chunk) => { log += chunk.toString(); });
      server.stderr.on("data", (chunk) => { log += chunk.toString(); });
      server.once("error", (error) => { startError = error; });

      try {
        // Match the probe in this process's log in case another process claimed the port.
        const probe = `/healthz?test=${basename(directory)}`;
        await expect.poll(async () => {
          if (startError) throw startError;
          if (server.exitCode !== null || server.signalCode !== null) {
            throw new Error(`GameBK stopped during startup:\n${log}`);
          }
          await fetch(baseURL + probe, { signal: AbortSignal.timeout(500) }).catch(() => {});
          return log.includes(probe);
        }, { timeout: 5000, message: "GameBK 启动成功" }).toBe(true);

        await use({ baseURL, saveDir, backupRoot });
      } finally {
        server.kill();
        await closed;
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  baseURL: async ({ gamebk }, use) => use(gamebk.baseURL),
});

export { expect };

export async function createFirstGame(page, { saveDir, backupRoot }, name) {
  await page.goto("/");
  await page.getByRole("region", { name: "还没有游戏" })
    .getByRole("button", { name: "新建游戏" }).click();

  const dialog = page.getByRole("dialog", { name: "新建游戏" });
  await dialog.getByLabel("名称", { exact: true }).fill(name);
  await dialog.getByLabel("存档路径", { exact: true }).fill(saveDir);
  await dialog.getByLabel("备份根目录", { exact: true }).fill(backupRoot);
  await dialog.getByRole("button", { name: "创建" }).click();
  await expect(dialog).toBeHidden();
}
