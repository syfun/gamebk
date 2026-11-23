import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createFirstGame, expect, test } from "./fixtures.js";

const longName = "北方之旅" + "NorthernAdventure".repeat(8);

test.describe("手机游戏列表", () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 360, height: 740 } });

  test("打开入口自动查询，空列表可直接新建游戏", async ({ page }) => {
    await page.goto("/ui/");
    await expect(page.getByText("还没有游戏", { exact: true })).toBeVisible();
    await page.getByRole("region", { name: "还没有游戏" })
      .getByRole("button", { name: "新建游戏" }).click();
    await expect(page.getByRole("dialog", { name: "新建游戏" })).toBeVisible();
  });

  test("等待读取，显示失败原因并可重试", async ({ page }) => {
    let finishReading;
    const reading = new Promise((resolve) => { finishReading = resolve; });
    await page.route("**/api/v1/games", async (route) => {
      await reading;
      await route.fulfill({ status: 503, json: { message: "服务暂不可用" } });
    }, { times: 1 });

    try {
      await page.goto("/ui/");
      await expect(page.getByRole("status")).toHaveText("正在加载游戏…");
    } finally {
      finishReading();
    }

    await expect(page.getByRole("alert")).toContainText("服务暂不可用");
    await page.route("**/api/v1/games", (route) => route.abort(), { times: 1 });
    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByRole("alert")).toContainText("无法连接服务");

    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByRole("heading", { name: "还没有游戏" })).toBeVisible();
  });

  test("长名称完整显示在手机卡片并可进入对应游戏", async ({ page, gamebk }) => {
    await createFirstGame(page, gamebk, longName);

    await expect(page.getByRole("table")).toBeHidden();
    const game = page.getByRole("link", { name: longName, exact: true });
    await expect(game).toBeVisible();
    await expect(game).toContainText(longName);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    expect(await game.evaluate((link) => link.scrollWidth)).toBeLessThanOrEqual(360);
    await game.tap();
    await expect(page).toHaveURL(/\/ui\/game\.html\?id=\d+$/);
    await expect(page.getByText(longName).first()).toBeVisible();
  });

  test("保存响应中断后可刷新核对实际结果并继续填写", async ({ page, gamebk }) => {
    await page.goto("/ui/");
    await page.getByRole("region", { name: "还没有游戏" })
      .getByRole("button", { name: "新建游戏" }).tap();
    const dialog = page.getByRole("dialog", { name: "新建游戏" });
    await dialog.getByLabel("名称", { exact: true }).fill("旧存档");
    await dialog.getByLabel("存档路径").fill(gamebk.saveDir);
    await dialog.getByLabel("备份根目录").fill(gamebk.backupRoot);

    await page.route("**/api/v1/games", async (route) => {
      await route.fetch();
      await route.abort("connectionreset");
    }, { times: 1 });

    await dialog.getByRole("button", { name: "创建" }).tap();
    await expect(dialog.getByRole("alert")).toContainText("保存结果待核对");
    await expect(dialog.getByLabel("名称", { exact: true })).toHaveValue("旧存档");
    await dialog.getByRole("button", { name: "刷新列表核对" }).tap();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "旧存档", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "继续填写" }).tap();
    await expect(dialog.getByLabel("名称", { exact: true })).toHaveValue("旧存档");
    await expect(dialog.getByLabel("存档路径")).toHaveValue(gamebk.saveDir);
    await expect(dialog.getByLabel("备份根目录")).toHaveValue(gamebk.backupRoot);
  });
});

test.describe("430 像素手机游戏列表", () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 430, height: 800 } });

  test("更多可新建、刷新其他页面保存的游戏并执行健康检查", async ({ page, browser, gamebk }) => {
    await createFirstGame(page, gamebk, "旧地图");
    const firstGame = page.getByRole("link", { name: "旧地图", exact: true });
    await expect(firstGame).toBeVisible();
    for (const name of ["新建游戏", "刷新", "健康检查"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeHidden();
    }

    const otherPage = await browser.newPage({
      baseURL: gamebk.baseURL,
      viewport: { width: 1280, height: 900 },
      isMobile: false,
      hasTouch: false,
    });
    try {
      await otherPage.goto("/ui/");
      await otherPage.getByRole("button", { name: "新建游戏", exact: true }).click();
      const dialog = otherPage.getByRole("dialog", { name: "新建游戏" });
      await dialog.getByLabel("名称", { exact: true }).fill(longName);
      await dialog.getByLabel("存档路径").fill(gamebk.saveDir);
      await dialog.getByLabel("备份根目录").fill(gamebk.backupRoot);
      await dialog.getByRole("button", { name: "创建" }).click();
      await expect(dialog).toBeHidden();
    } finally {
      await otherPage.close();
    }

    const more = page.getByRole("button", { name: "更多", exact: true });
    const otherGame = page.getByRole("link", { name: longName, exact: true });
    await expect(otherGame).toBeHidden();
    await more.tap();
    await page.getByRole("button", { name: "刷新", exact: true }).tap();
    await expect(otherGame).toBeVisible();
    const gameCards = await page.getByRole("list", { name: "游戏列表" }).getByRole("link").all();
    const top = await gameCards[0].boundingBox();
    const next = await gameCards[1].boundingBox();
    expect(next.y).toBeGreaterThanOrEqual(top.y + top.height);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(430);

    await more.tap();
    await page.getByRole("button", { name: "健康检查" }).tap();
    await expect(page.getByText("健康检查通过", { exact: true })).toBeVisible();

    await more.tap();
    await page.getByRole("button", { name: "新建游戏", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: "新建游戏" })).toBeVisible();
  });

  test("短屏表单保存时防止重复提交，服务拒绝后保留输入供重试", async ({ page, gamebk }) => {
    await page.setViewportSize({ width: 430, height: 340 });
    await page.goto("/ui/");
    await page.getByRole("region", { name: "还没有游戏" })
      .getByRole("button", { name: "新建游戏" }).tap();

    const dialog = page.getByRole("dialog", { name: "新建游戏" });
    const name = dialog.getByLabel("名称", { exact: true });
    const saveDir = dialog.getByLabel("存档路径");
    const backupRoot = dialog.getByLabel("备份根目录");
    const submit = dialog.getByRole("button", { name: "创建" });
    await name.fill("保存点");
    await saveDir.fill(gamebk.saveDir);
    await backupRoot.fill(gamebk.backupRoot);

    let finishSaving;
    const saving = new Promise((resolve) => { finishSaving = resolve; });
    await page.route("**/api/v1/games", async (route) => {
      await saving;
      await route.fulfill({ status: 503, json: { message: "配置暂时无法保存" } });
    }, { times: 1 });

    try {
      await submit.tap();
      await expect(dialog.getByRole("status")).toHaveText("正在创建游戏…");
      await expect(submit).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      const button = await submit.boundingBox();
      await page.touchscreen.tap(button.x + button.width / 2, button.y + button.height / 2);
    } finally {
      finishSaving();
    }

    await expect(dialog.getByRole("alert")).toContainText("配置暂时无法保存");
    await expect(name).toHaveValue("保存点");
    await expect(saveDir).toHaveValue(gamebk.saveDir);
    await expect(backupRoot).toHaveValue(gamebk.backupRoot);
    await expect(submit).toBeEnabled();
    await submit.tap();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "保存点", exact: true })).toHaveCount(1);
  });
});

test("桌面表格完整显示长配置并可编辑和打开游戏", async ({ page, gamebk }) => {
  const name = "<NewMap> " + longName;
  const saveDir = join(gamebk.saveDir, "SaveLocation".repeat(15));
  const backupRoot = join(gamebk.backupRoot, "BackupLocation".repeat(15));
  await Promise.all([mkdir(saveDir), mkdir(backupRoot)]);
  await createFirstGame(page, { saveDir, backupRoot }, name);

  await page.goto("/ui/");
  const table = page.getByRole("table");
  const game = table.getByRole("row").filter({ hasText: name });
  for (const value of [name, saveDir, backupRoot]) {
    const cell = game.getByRole("cell", { name: value, exact: true });
    await expect(cell).toBeVisible();
    const box = await cell.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
  await expect(table.getByRole("columnheader", { name: "操作" })).toBeInViewport();
  await game.getByRole("button", { name: "编辑" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑游戏" });
  const nameField = dialog.getByLabel("名称", { exact: true });
  const backupField = dialog.getByLabel("备份根目录");
  await expect(nameField).toHaveValue(name);
  await expect(dialog.getByLabel("存档路径")).toHaveValue(saveDir);
  await expect(backupField).toHaveValue(backupRoot);
  await nameField.fill("新地图");
  await backupField.fill(gamebk.backupRoot);
  await dialog.getByRole("button", { name: "更新" }).click();

  await expect(dialog).toBeHidden();
  const updatedGame = table.getByRole("row").filter({ hasText: "新地图" });
  await expect(updatedGame.getByRole("cell", { name: gamebk.backupRoot, exact: true })).toBeVisible();
  await updatedGame.getByRole("button", { name: "打开" }).click();
  await expect(page).toHaveURL(/\/ui\/game\.html\?id=\d+$/);
});
