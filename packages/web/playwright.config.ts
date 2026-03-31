import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const host = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1"
const webPort = Number(process.env.PLAYWRIGHT_PORT ?? "1421")
const backendHost = process.env.PLAYWRIGHT_BACKEND_HOST ?? host
const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? "3900")

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${webPort}`
const backendURL = process.env.PLAYWRIGHT_BACKEND_URL ?? `http://${backendHost}:${backendPort}`
const runtimeRoot =
  process.env.PLAYWRIGHT_RUNTIME_ROOT ?? path.join(os.tmpdir(), `buddy-e2e-runtime-${process.pid}`)
const e2eHome = path.join(runtimeRoot, "home")
const xdgDataHome = path.join(runtimeRoot, "data")
const xdgCacheHome = path.join(runtimeRoot, "cache")
const xdgConfigHome = path.join(runtimeRoot, "config")
const xdgStateHome = path.join(runtimeRoot, "state")
const buddyGlobalConfigDir = path.join(e2eHome, ".buddy")
const opencodeManagedConfigDir = path.join(runtimeRoot, "opencode-managed-config")
const repoRoot = path.resolve(__dirname, "../..")
const reuseServers = process.env.PLAYWRIGHT_REUSE_SERVER === "1"

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? "1"),
  reporter: [["html", { outputFolder: "e2e/playwright-report", open: "never" }], ["line"]],
  webServer: [
    {
      command: "bun run --cwd packages/buddy start",
      cwd: repoRoot,
      url: `${backendURL}/api/healthz`,
      reuseExistingServer: reuseServers,
      timeout: 180_000,
      env: {
        ...process.env,
        PORT: String(backendPort),
        HOME: e2eHome,
        BUDDY_E2E_MODE: "1",
        BUDDY_RUNTIME_ROOT: runtimeRoot,
        BUDDY_TEST_HOME: e2eHome,
        BUDDY_GLOBAL_CONFIG_DIR: buddyGlobalConfigDir,
        OPENCODE_CONFIG_DIR: buddyGlobalConfigDir,
        OPENCODE_TEST_HOME: e2eHome,
        OPENCODE_TEST_MANAGED_CONFIG_DIR: opencodeManagedConfigDir,
        XDG_DATA_HOME: xdgDataHome,
        XDG_CACHE_HOME: xdgCacheHome,
        XDG_CONFIG_HOME: xdgConfigHome,
        XDG_STATE_HOME: xdgStateHome,
        OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
        OPENCODE_DISABLE_MODELS_FETCH: "1",
        OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
        OPENCODE_ENABLE_EXA: "0",
      },
    },
    {
      command: `bun run --cwd packages/web dev -- --host ${host} --port ${webPort} --strictPort`,
      cwd: repoRoot,
      url: baseURL,
      reuseExistingServer: reuseServers,
      timeout: 180_000,
      env: {
        ...process.env,
        VITE_BUDDY_E2E: "1",
        VITE_BUDDY_BACKEND_URL: backendURL,
        VITE_BUDDY_WEB_PORT: String(webPort),
      },
    },
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "smoke-web",
      testMatch: /smoke-web\/.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "core-web",
      testMatch: /core-web\/.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "faults-web",
      testMatch: /faults-web\/.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "desktop-shell",
      testMatch: /desktop-shell\/.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
})
