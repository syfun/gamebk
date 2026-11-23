import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/build.js",
  use: { trace: "retain-on-failure" },
});
