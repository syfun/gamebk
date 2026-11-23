import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

  test("同名备份失败时显示目录冲突并可重新填写名称", async ({ page, gamebk }) => {
    const gameName = "远征记录";
    const duplicateName = "重复名称";
    const destination = join(gamebk.backupRoot, duplicateName);
    await mkdir(destination);
    await writeFile(join(destination, "slot.dat"), "existing backup");
    await writeFile(join(gamebk.saveDir, "slot.dat"), "current save");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);

    await page.getByRole("button", { name: "自定义名称" }).click();
    const dialog = page.getByRole("dialog", { name: "自定义名称" });
    const name = dialog.getByLabel("备份名称");
    const submit = dialog.getByRole("button", { name: "开始备份" });
    await name.fill(duplicateName);
    await submit.click();

    await expect(dialog.getByRole("status")).toContainText(`destination already exists: ${destination}`);
    await expect(name).toHaveValue(duplicateName);
    await expect(submit).toBeEnabled();
    expect(await readFile(join(destination, "slot.dat"), "utf8")).toBe("existing backup");

    const newName = "可用名称";
    await name.fill(newName);
    await submit.click();
    await expect(dialog).toBeHidden();
    expect(await readFile(join(gamebk.backupRoot, newName, "slot.dat"), "utf8")).toBe("current save");
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

  test("保存配置请求中断后可刷新核对并继续填写原草稿", async ({ page, gamebk }) => {
    const gameName = "原始配置";
    const draftName = "修改后的配置";
    const draftSaveDir = join(gamebk.saveDir, "new-save");
    const draftBackupRoot = join(gamebk.backupRoot, "new-backup");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);

    const menu = page.getByRole("navigation", { name: "游戏详情导航" });
    await menu.getByText("更多", { exact: true }).click();
    await menu.getByRole("button", { name: "编辑配置" }).click();
    const dialog = page.getByRole("dialog", { name: "编辑配置" });
    const name = dialog.getByLabel("名称", { exact: true });
    const savePath = dialog.getByLabel("存档路径");
    const backupRoot = dialog.getByLabel("备份根目录");
    await name.fill(draftName);
    await savePath.fill(draftSaveDir);
    await backupRoot.fill(draftBackupRoot);

    await page.route("**/api/v1/games/*", (route) => route.abort("connectionreset"), { times: 1 });
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog.getByRole("status")).toContainText("结果待核对");
    await expect(name).toHaveValue(draftName);

    const refreshed = page.waitForResponse("**/api/v1/games");
    await dialog.getByRole("button", { name: "刷新数据" }).click();
    expect((await refreshed).ok()).toBe(true);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: gameName, exact: true })).toBeVisible();
    await menu.getByText("更多", { exact: true }).click();
    await expect(menu.getByText(gamebk.saveDir, { exact: true })).toBeVisible();
    await expect(menu.getByText(gamebk.backupRoot, { exact: true })).toBeVisible();
    await menu.getByText("更多", { exact: true }).click();

    const resume = page.getByRole("button", { name: "继续填写" });
    await expect(resume).toBeVisible();
    await resume.click();
    await expect(name).toHaveValue(draftName);
    await expect(savePath).toHaveValue(draftSaveDir);
    await expect(backupRoot).toHaveValue(draftBackupRoot);
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: draftName, exact: true })).toBeVisible();
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

  test("从历史确认恢复，取消保留整个存档目录", async ({ page, gamebk }) => {
    const gameName = "远征" + "VeryLongGameName".repeat(8);
    const backupName = "LongCheckpoint".repeat(12);
    const slot = join(gamebk.saveDir, "profile", "slot.dat");
    const extra = join(gamebk.saveDir, "recent.dat");
    await mkdir(join(gamebk.saveDir, "profile"));
    await writeFile(slot, "old checkpoint");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    const backup = await saveNamedBackup(page, backupName);
    await writeFile(slot, "new checkpoint");
    await writeFile(extra, "added later");
    await saveNamedBackup(page, "最近进度");

    const history = page.getByRole("region", { name: "备份历史" });
    const card = history.getByRole("article", { name: backupName, exact: true });
    const restore = card.getByRole("button", { name: "恢复", exact: true });
    const dialog = page.getByRole("dialog", { name: "恢复备份" });
    const requests = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/restore/")) {
        requests.push(new URL(request.url()).pathname);
      }
    });

    await restore.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(gameName, { exact: true })).toBeVisible();
    await expect(dialog.getByText(backupName, { exact: true })).toBeVisible();
    const created = dialog.locator("time");
    await expect(created).toBeVisible();
    await expect(created).toHaveAttribute("datetime", backup.created_at);
    await expect(created).toHaveText(await card.locator("time").innerText());
    await expect(dialog).toHaveAccessibleDescription("整个存档目录将被替换。");
    expect(await dialog.evaluate((element) => element.scrollWidth)).toBe(
      await dialog.evaluate((element) => element.clientWidth),
    );

    const cancel = dialog.getByRole("button", { name: "取消" });
    await expect(cancel).toBeFocused();
    await cancel.click();
    await expect(dialog).toBeHidden();
    await expect(restore).toBeFocused();
    expect(requests).toHaveLength(0);
    expect((await readdir(gamebk.saveDir, { recursive: true })).sort()).toEqual(
      ["profile", join("profile", "slot.dat"), "recent.dat"],
    );
    expect(await readFile(slot, "utf8")).toBe("new checkpoint");
    expect(await readFile(extra, "utf8")).toBe("added later");

    await restore.click();
    await dialog.getByRole("button", { name: "确认恢复" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "已恢复备份" })).toContainText(backupName);
    expect(requests).toEqual([`/api/v1/games/${backup.game_id}/restore/${backup.id}`]);
    expect((await readdir(gamebk.saveDir, { recursive: true })).sort()).toEqual(
      ["profile", join("profile", "slot.dat")],
    );
    expect(await readFile(slot, "utf8")).toBe("old checkpoint");
  });

  test("恢复最新先读取历史，确认后仍恢复已展示的目标", async ({ page, gamebk }) => {
    const gameName = "港口存档";
    const slot = join(gamebk.saveDir, "slot.dat");
    await writeFile(slot, "first");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    await saveNamedBackup(page, "Z 首次到港");

    const editor = await page.context().newPage();
    await editor.goto("/ui/");
    await openGame(editor, gameName);
    await writeFile(slot, "selected by latest");
    const selected = await saveNamedBackup(editor, "B 离港前");

    const history = page.getByRole("region", { name: "备份历史" });
    await expect(history.getByRole("article")).toHaveCount(1);
    const dialog = page.getByRole("dialog", { name: "恢复备份" });
    const latest = page.getByRole("button", { name: "恢复最新" });
    let finishReading;
    const reading = new Promise((resolve) => { finishReading = resolve; });
    await page.route("**/api/v1/games/*/backups", async (route) => {
      await reading;
      await route.continue();
    }, { times: 1 });
    try {
      await latest.click();
      await expect(history.getByRole("status")).toHaveText("正在加载备份历史…");
      await expect(latest).toBeDisabled();
      await expect(page.getByRole("button", { name: "立即备份" })).toBeDisabled();
      await expect(dialog).toBeHidden();
    } finally {
      finishReading();
    }

    await expect(dialog.getByText(gameName, { exact: true })).toBeVisible();
    await expect(dialog.getByText(selected.name, { exact: true })).toBeVisible();
    await expect(dialog.locator("time")).toHaveAttribute("datetime", selected.created_at);
    await expect(dialog).toHaveAccessibleDescription("整个存档目录将被替换。");

    const extra = join(gamebk.saveDir, "local-only.dat");
    await writeFile(slot, "current save before cancel");
    await writeFile(extra, "local changes");
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();
    expect((await readdir(gamebk.saveDir)).sort()).toEqual(["local-only.dat", "slot.dat"]);
    expect(await readFile(slot, "utf8")).toBe("current save before cancel");
    expect(await readFile(extra, "utf8")).toBe("local changes");

    await latest.click();
    await expect(dialog.getByText(selected.name, { exact: true })).toBeVisible();
    await writeFile(slot, "newest, created during confirmation");
    await saveNamedBackup(editor, "A 离港后");
    await dialog.getByRole("button", { name: "确认恢复" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "已恢复备份" })).toContainText(selected.name);
    expect(await readdir(gamebk.saveDir)).toEqual(["slot.dat"]);
    expect(await readFile(slot, "utf8")).toBe("selected by latest");
  });

  test("从手机备份卡片确认后只删除选中的文件和记录", async ({ page, gamebk }) => {
    const gameName = "航海笔记";
    const keepName = "保留的进度";
    const deleteName = "待清理的进度";
    await writeFile(join(gamebk.saveDir, "slot.dat"), "ship log");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    await saveNamedBackup(page, keepName);
    const backup = await saveNamedBackup(page, deleteName);

    const history = page.getByRole("region", { name: "备份历史" });
    const card = history.getByRole("article", { name: deleteName, exact: true });
    await card.getByText("更多", { exact: true }).click();
    const deleteButton = card.getByRole("button", { name: "删除", exact: true });
    const dialog = page.getByRole("dialog", { name: "删除备份" });
    const requests = [];
    page.on("request", (request) => {
      if (request.method() === "DELETE") requests.push(new URL(request.url()).pathname);
    });

    await deleteButton.click();
    await expect(dialog.getByText(gameName, { exact: true })).toBeVisible();
    await expect(dialog.getByText(deleteName, { exact: true })).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("这份备份的文件和记录都将被删除。");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(requests).toHaveLength(0);
    expect(await readFile(join(gamebk.backupRoot, deleteName, "slot.dat"), "utf8")).toBe("ship log");
    await expect(card).toBeVisible();

    await deleteButton.click();
    await dialog.getByRole("button", { name: "确认删除" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "已删除备份" })).toContainText(deleteName);
    await expect(card).toHaveCount(0);
    await expect(history.getByRole("article", { name: keepName, exact: true })).toBeVisible();
    expect(requests).toEqual([`/api/v1/games/${backup.game_id}/backups/${backup.id}`]);
    expect(await readdir(gamebk.backupRoot)).toEqual([keepName]);
    expect(await readFile(join(gamebk.backupRoot, keepName, "slot.dat"), "utf8")).toBe("ship log");
  });

  test("删除全部备份按确认后服务实际删除的数量反馈", async ({ page, gamebk }) => {
    const gameName = "整理归档";
    const slot = join(gamebk.saveDir, "slot.dat");
    await writeFile(slot, "active save");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    const first = await saveNamedBackup(page, "初始记录");

    const menu = page.getByRole("navigation", { name: "游戏详情导航" });
    await menu.getByText("更多", { exact: true }).click();
    const deleteAll = menu.getByRole("button", { name: "删除全部备份" });
    const dialog = page.getByRole("dialog", { name: "删除全部备份" });
    const requests = [];
    page.on("request", (request) => {
      if (request.method() === "DELETE") requests.push(new URL(request.url()).pathname);
    });

    await deleteAll.click();
    await expect(dialog.getByText(gameName, { exact: true })).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("该游戏的所有备份文件和记录都将被删除。");
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();
    expect(requests).toHaveLength(0);
    expect(await readdir(gamebk.backupRoot)).toEqual([first.name]);
    expect(await readFile(join(gamebk.backupRoot, first.name, "slot.dat"), "utf8")).toBe("active save");

    await deleteAll.click();
    await expect(dialog).toBeVisible();
    const editor = await page.context().newPage();
    await editor.goto("/ui/");
    await expect(editor.getByRole("link", { name: gameName, exact: true }))
      .toHaveAccessibleDescription(/^最近备份 /);
    await openGame(editor, gameName);
    await saveNamedBackup(editor, "确认期间新增的记录");

    await dialog.getByRole("button", { name: "确认删除" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("已删除 2 份备份。", { exact: true })).toBeVisible();
    await expect(page.getByText("还没有备份")).toBeVisible();
    await expect(page.getByRole("button", { name: "恢复最新" })).toBeDisabled();
    expect(requests).toEqual([`/api/v1/games/${first.game_id}/backups`]);
    expect(await readdir(gamebk.backupRoot)).toEqual([]);
    expect(await readFile(slot, "utf8")).toBe("active save");

    await page.getByRole("link", { name: "返回游戏列表" }).click();
    await expect(page.getByRole("link", { name: gameName, exact: true }))
      .toHaveAccessibleDescription("尚未备份");
  });

  test("恢复处理中只提交一次，连接中断后可刷新数据核对", async ({ page, gamebk }) => {
    const gameName = "山顶存档";
    const backupName = "到达山顶";
    const slot = join(gamebk.saveDir, "slot.dat");
    await writeFile(slot, "checkpoint");
    await createFirstGame(page, gamebk, gameName);
    await openGame(page, gameName);
    await saveNamedBackup(page, backupName);
    await writeFile(slot, "current save");
    await page.setViewportSize({ width: 360, height: 370 });

    let finishWriting;
    const writing = new Promise((resolve) => { finishWriting = resolve; });
    let submissions = 0;
    let status;
    await page.route("**/api/v1/games/*/restore/*", async (route) => {
      submissions += 1;
      status = (await route.fetch()).status();
      await writing;
      await route.abort();
    });

    const card = page.getByRole("article", { name: backupName, exact: true });
    const dialog = page.getByRole("dialog", { name: "恢复备份" });
    const confirm = dialog.getByRole("button", { name: "确认恢复" });
    try {
      await card.getByRole("button", { name: "恢复", exact: true }).click();
      await confirm.click();
      const pending = dialog.getByRole("status");
      await expect(pending).toHaveText("正在恢复备份…");
      await expect(pending).toBeInViewport();
      await expect(confirm).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "取消" })).toBeDisabled();
      await expect(page.getByText("立即备份", { exact: true })).toBeDisabled();
      await confirm.tap({ force: true });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
    } finally {
      finishWriting();
    }

    await expect(dialog.getByRole("status")).toContainText("操作结果待核对");
    await expect(confirm).toBeEnabled();
    await dialog.getByRole("button", { name: "刷新数据" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toBeVisible();
    await expect(page.getByRole("button", { name: "立即备份" })).toBeEnabled();
    expect(submissions).toBe(1);
    expect(status).toBe(200);
    expect(await readFile(slot, "utf8")).toBe("checkpoint");
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

test("桌面恢复目标被另一页面删除，可从确认反馈刷新历史", async ({ page, gamebk }) => {
  const gameName = "赛季记录";
  const deletedName = "待删除的旧存档";
  const remainingName = "保留的存档";
  const slot = join(gamebk.saveDir, "slot.dat");
  await writeFile(slot, "old save");
  await createFirstGame(page, gamebk, gameName);
  await openGame(page, gameName);
  await saveNamedBackup(page, deletedName);
  await writeFile(slot, "current save");
  await saveNamedBackup(page, remainingName);

  const history = page.getByRole("region", { name: "备份历史" });
  const row = history.getByRole("row").filter({ hasText: deletedName });
  await row.getByRole("button", { name: "恢复", exact: true }).click();
  const restoreDialog = page.getByRole("dialog", { name: "恢复备份" });
  await expect(restoreDialog.getByText(deletedName, { exact: true })).toBeVisible();
  await expect(restoreDialog.getByText(gameName, { exact: true })).toBeVisible();
  await expect(restoreDialog).toHaveAccessibleDescription("整个存档目录将被替换。");

  const editor = await page.context().newPage();
  await editor.goto("/ui/");
  await openGame(editor, gameName);
  const editorRow = editor.getByRole("row").filter({ hasText: deletedName });
  await editorRow.getByRole("button", { name: "删除", exact: true }).click();
  const deleteDialog = editor.getByRole("dialog", { name: "删除备份" });
  await expect(deleteDialog.getByText(deletedName, { exact: true })).toBeVisible();
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await expect(editorRow).toHaveCount(0);

  await restoreDialog.getByRole("button", { name: "确认恢复" }).click();
  await expect(restoreDialog.getByRole("status")).toContainText("所选备份已不存在");
  await restoreDialog.getByRole("button", { name: "刷新数据" }).click();
  await expect(restoreDialog).toBeHidden();
  await expect(history.getByRole("table").getByRole("cell", { name: remainingName, exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(await readFile(slot, "utf8")).toBe("current save");
});
