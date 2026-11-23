import { createFirstGame, expect, test } from "./fixtures.js";

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
});

test("桌面入口自动显示已有游戏和完整配置", async ({ page, gamebk }) => {
  const name = "<NewMap> 旧地图";
  await createFirstGame(page, gamebk, name);

  await page.goto("/ui/");
  const game = page.getByRole("table").getByRole("row").filter({ hasText: name });
  await expect(game.getByRole("cell", { name, exact: true })).toBeVisible();
  await expect(game.getByRole("cell", { name: gamebk.saveDir })).toBeVisible();
  await expect(game.getByRole("cell", { name: gamebk.backupRoot })).toBeVisible();
  await expect(game.getByRole("button", { name: "编辑" })).toBeVisible();
});
