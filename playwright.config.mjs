import { defineConfig, devices } from "@playwright/test";

const useLocalServer = process.env.PLAYWRIGHT_LOCAL === "1";
const host = process.env.PLAYWRIGHT_HOST || "127.0.0.1";
const port = Number(process.env.PLAYWRIGHT_PORT || process.env.PORT || 3000);
const localServerCommandHost = process.env.PLAYWRIGHT_LISTEN_HOST || "127.0.0.1";
const baseUrl = `http://${host}:${port}`;
const remoteUrl = process.env.PLAYWRIGHT_BASE_URL || "https://constera.az";
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const localBrowserArgs = process.env.PLAYWRIGHT_LOCAL_BROWSER_ARGS
  ? process.env.PLAYWRIGHT_LOCAL_BROWSER_ARGS.split(" ").filter(Boolean)
  : [];

export default defineConfig({
  testDir: "./tests/layout",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 8_000
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }]
  ],
  outputDir: "test-results",
  use: {
    baseURL: useLocalServer ? baseUrl : remoteUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off"
  },
  ...(useLocalServer
    ? {
      webServer: {
        command: "npm run dev",
        env: {
          PORT: String(port),
          HOST: localServerCommandHost
        },
        url: `${baseUrl}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe"
      }
    }
    : {}),
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
        ...(localBrowserArgs.length ? { launchOptions: { args: localBrowserArgs } } : {})
      }
    }
  ]
});
