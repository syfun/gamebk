import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFirstGame, expect, test } from "./fixtures.js";

async function openGame(page, name) {
  await page.getByRole("link", { name, exact: true })
    .or(page.getByRole("button", { name: "打开", exact: true }))
    .filter({ visible: true }).click();
}

async function saveNamedBackup(page, name) {
  await page.getByRole("button", { name: "自定义名称" }).click();
  const dialog = page.getByRole("dialog", { name: "自定义名称" });
  await dialog.getByLabel("备份名称").fill(name);
  const response = page.waitForResponse("**/api/v1/games/*/backup");
  await dialog.getByRole("button", { name: "开始备份" }).click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  await expect(dialog).toBeHidden();
  return (await saved.json()).data;
}

test.describe("手机游戏详情", () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 360, height: 740 } });

  test("首屏可以立即备份并显示服务保存的名称", async ({ page, gamebk }) => {
    const gameName = "探险记录";
    await writeFile(join(gamebk.saveDir, "slot.dat"), "before backup");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);

    await expect(page.getByRole("heading", { name: gameName, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "返回游戏列表" })).toBeVisible();
    await expect(page.getByRole("button", { name: "恢复最新" })).toBeInViewport();
    const backup = page.getByRole("button", { name: "立即备份" });
    await expect(backup).toBeInViewport();

    const response = page.waitForResponse("**/api/v1/games/*/backup");
    await backup.click();
    const saved = await response;
    expect(saved.request().postDataJSON()).toEqual({ name: null });
    expect(saved.status()).toBe(201);
    const { data } = await saved.json();
    expect(data.name).toMatch(/^\d{8}_\d{6}$/);
    await expect(page.getByRole("status").filter({ hasText: "备份成功" })).toContainText(data.name);
    await expect(page.getByRole("region", { name: "备份历史" }).getByRole("article", { name: data.name, exact: true }))
      .toBeVisible();
    expect(await readFile(join(gamebk.backupRoot, data.name, "slot.dat"), "utf8"))
      .toBe("before backup");
  });

  test("自定义名称可以填写或留空", async ({ page, gamebk }) => {
    const gameName = "自由探索";
    await writeFile(join(gamebk.saveDir, "slot.dat"), "named copy");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    const custom = page.getByRole("button", { name: "自定义名称" });
    await expect(custom).toBeInViewport();
    await custom.click();

    const dialog = page.getByRole("dialog", { name: "自定义名称" });
    const backupName = dialog.getByLabel("备份名称");
    const submit = dialog.getByRole("button", { name: "开始备份" });
    await backupName.fill("  决战前  ");
    const renamedResponse = page.waitForResponse("**/api/v1/games/*/backup");
    await submit.click();
    expect((await renamedResponse).request().postDataJSON()).toEqual({ name: "决战前" });
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "备份历史" }).getByRole("article", { name: "决战前", exact: true }))
      .toBeVisible();
    expect(await readFile(join(gamebk.backupRoot, "决战前", "slot.dat"), "utf8"))
      .toBe("named copy");

    await custom.click();
    await expect(backupName).toHaveValue("");
    const defaultResponse = page.waitForResponse("**/api/v1/games/*/backup");
    await submit.click();
    const saved = await defaultResponse;
    expect(saved.request().postDataJSON()).toEqual({ name: null });
    const { data } = await saved.json();
    expect(data.name).toMatch(/^\d{8}_\d{6}$/);
    await expect(page.getByRole("status").filter({ hasText: "备份成功" })).toContainText(data.name);
  });

  test("窄屏历史按时间展示，长名称和完整路径均可读", async ({ page, gamebk }) => {
    await page.setViewportSize({ width: 430, height: 600 });
    const gameName = "远征" + "VeryLongGameName".repeat(8);
    const newer = "LongCheckpoint".repeat(12);
    await writeFile(join(gamebk.saveDir, "slot.dat"), "first version");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    await expect(page.getByRole("heading", { name: gameName, exact: true })).toBeVisible();
    await saveNamedBackup(page, "旧进度");
    await writeFile(join(gamebk.saveDir, "slot.dat"), "saved copy");
    const newest = await saveNamedBackup(page, newer);

    const history = page.getByRole("region", { name: "备份历史" });
    const card = history.getByRole("article").first();
    await expect(card).toHaveAccessibleName(newer);
    await expect(history.getByRole("article").last()).toHaveAccessibleName("旧进度");
    await expect(card.getByRole("heading", { name: newer, exact: true })).toBeVisible();
    await expect(card.getByText("10 B", { exact: true })).toBeVisible();
    const created = card.locator("time");
    await expect(created).toBeVisible();
    await expect(created).toHaveAttribute("datetime", newest.created_at);
    await expect(history.getByRole("table")).toBeHidden();

    const fullPath = card.getByText(join(gamebk.backupRoot, newer), { exact: true });
    await expect(fullPath).toBeHidden();
    await card.getByText("更多", { exact: true }).click();
    await expect(fullPath).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(430);

    await history.getByRole("article").last().evaluate((record) => {
      record.scrollIntoView({ block: "start" });
    });
    await expect(page.getByRole("button", { name: "立即备份" })).not.toBeInViewport();
    await expect(page.getByRole("status").filter({ hasText: "备份成功" })).toBeInViewport();

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopHistory = history.getByRole("table");
    await expect(desktopHistory).toBeVisible();
    await expect(desktopHistory.getByRole("cell", { name: newer, exact: true })).toBeVisible();
    await expect(desktopHistory.getByRole("cell", { name: join(gamebk.backupRoot, newer), exact: true }))
      .toBeVisible();
  });

  test("详情编辑失败保留输入，保存后显示服务返回的配置", async ({ page, gamebk }) => {
    const gameName = "旧标题";
    const newSaveDir = join(gamebk.saveDir, "new-save");
    const newBackupRoot = join(gamebk.backupRoot, "new-backup");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    await page.setViewportSize({ width: 360, height: 340 });

    const menu = page.getByRole("navigation", { name: "游戏详情导航" });
    await menu.getByText("更多", { exact: true }).click();
    await menu.getByRole("button", { name: "编辑配置" }).click();

    const dialog = page.getByRole("dialog", { name: "编辑配置" });
    const name = dialog.getByLabel("名称", { exact: true });
    const savePath = dialog.getByLabel("存档路径");
    const backupRoot = dialog.getByLabel("备份根目录");
    const save = dialog.getByRole("button", { name: "保存" });
    await expect(name).toHaveValue(gameName);
    await expect(savePath).toHaveValue(gamebk.saveDir);
    await expect(backupRoot).toHaveValue(gamebk.backupRoot);

    await name.fill("  ");
    await savePath.fill(newSaveDir + "  ");
    await backupRoot.fill(newBackupRoot + "  ");
    await save.click();
    await expect(dialog.getByRole("status")).toContainText("name cannot be empty");
    await expect(name).toHaveValue("  ");
    await expect(savePath).toHaveValue(newSaveDir + "  ");
    await expect(backupRoot).toHaveValue(newBackupRoot + "  ");

    await name.fill("  新标题  ");
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "新标题", exact: true })).toBeVisible();
    await menu.getByText("更多", { exact: true }).click();
    await expect(menu.getByText(newSaveDir, { exact: true })).toBeVisible();
    await expect(menu.getByText(newBackupRoot, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  });

  test("历史加载失败可以重试，空态禁用恢复最新", async ({ page, gamebk }) => {
    const gameName = "还未游玩";
    await createFirstGame(page, gamebk, gameName);
    let finishReading;
    const reading = new Promise((resolve) => { finishReading = resolve; });
    await page.route("**/api/v1/games/*/backups", async (route) => {
      await reading;
      await route.fulfill({ status: 503, json: { message: "历史暂不可用" } });
    }, { times: 1 });

    const history = page.getByRole("region", { name: "备份历史" });
    const latest = page.getByRole("button", { name: "恢复最新" });
    try {
      await openGame(page, gameName);
      await expect(history.getByRole("status")).toHaveText("正在加载备份历史…");
      await expect(latest).toBeDisabled();
    } finally {
      finishReading();
    }

    await expect(history.getByRole("alert")).toContainText("历史暂不可用");
    await expect(history.getByText("还没有备份")).toBeHidden();
    await expect(latest).toBeDisabled();
    await history.getByRole("button", { name: "重试" }).click();
    await expect(history.getByText("还没有备份")).toBeVisible();
    await expect(history.getByRole("alert")).toBeHidden();
    await expect(latest).toBeDisabled();

    await saveNamedBackup(page, "新起点");
    await expect(latest).toBeEnabled();
  });

  test("处理中拦截再次备份，连接中断后可以刷新核对实际记录", async ({ page, gamebk }) => {
    const gameName = "回合记录";
    await writeFile(join(gamebk.saveDir, "slot.dat"), "old save");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    await saveNamedBackup(page, "第一份记录");
    await writeFile(join(gamebk.saveDir, "slot.dat"), "committed save");
    await page.setViewportSize({ width: 360, height: 300 });

    let finishWriting;
    const writing = new Promise((resolve) => { finishWriting = resolve; });
    let submissions = 0;
    let saved;
    await page.route("**/api/v1/games/*/backup", async (route) => {
      submissions += 1;
      const response = await route.fetch();
      saved = (await response.json()).data;
      await writing;
      await route.abort();
    });

    const backup = page.getByRole("button", { name: "立即备份" });
    const history = page.getByRole("region", { name: "备份历史" });
    try {
      await backup.click();
      const pending = page.getByRole("status").filter({ hasText: "正在创建备份" });
      await expect(pending).toBeInViewport();
      await expect(backup).toBeDisabled();
      await expect(page.getByRole("button", { name: "自定义名称" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "恢复最新" })).toBeDisabled();
      await expect(history.getByRole("button", { name: "恢复", exact: true })).toBeDisabled();
      await backup.tap({ force: true });
      const menu = page.getByRole("navigation", { name: "游戏详情导航" });
      await menu.getByText("更多", { exact: true }).click();
      await expect(menu.getByRole("button", { name: "编辑配置" })).toBeDisabled();
      await menu.getByText("更多", { exact: true }).click();
      await history.getByRole("article").evaluate((record) => {
        record.scrollIntoView({ block: "start" });
      });
      await expect(pending).toBeInViewport();
      await expect(backup).not.toBeInViewport();
    } finally {
      finishWriting();
    }

    await expect(page.getByRole("status").filter({ hasText: "操作结果待核对" })).toBeInViewport();
    await expect(backup).toBeEnabled();
    await expect(history.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "刷新数据" }).click();
    await expect(history.getByRole("article")).toHaveCount(2);
    await expect(history.getByRole("article").first()).toHaveAccessibleName(saved.name);
    expect(submissions).toBe(1);
    expect(await readFile(join(gamebk.backupRoot, saved.name, "slot.dat"), "utf8"))
      .toBe("committed save");
  });
});
