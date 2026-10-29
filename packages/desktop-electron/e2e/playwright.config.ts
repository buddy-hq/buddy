import { fileURLToPath } from "node:url"
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: true,
  reporter: "list",
  use: { trace: "retain-on-failure" },
})
