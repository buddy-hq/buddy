import { describe, expect, test } from "bun:test"
import { app } from "../src/index.ts"
import { AdvancedMathRuntimeService } from "../src/local-runtimes/advanced-math/service"
import {
  withLocalMockAdvancedMathRuntimeAssets,
  withMockAdvancedMathRuntimeAssets,
} from "./helpers/advanced-math-runtime"

describe("local runtime routes", () => {
  test("installs and removes the advanced math runtime through the API", async () => {
    await withMockAdvancedMathRuntimeAssets(async () => {
      const before = await app.request("/api/local-runtimes/advanced-math")
      expect(before.status).toBe(200)
      await expect(before.json()).resolves.toMatchObject({
        ready: false,
      })

      const install = await app.request("/api/local-runtimes/advanced-math/install", {
        method: "POST",
      })
      expect(install.status).toBe(200)
      await expect(install.json()).resolves.toMatchObject({
        state: "ready",
        ready: true,
      })

      const afterInstall = await app.request("/api/local-runtimes/advanced-math")
      expect(afterInstall.status).toBe(200)
      await expect(afterInstall.json()).resolves.toMatchObject({
        state: "ready",
        ready: true,
      })

      const remove = await app.request("/api/local-runtimes/advanced-math/install", {
        method: "DELETE",
      })
      expect(remove.status).toBe(200)
      await expect(remove.json()).resolves.toMatchObject({
        state: "not_installed",
        ready: false,
      })
    })
  })

  test("installs from a local development asset when release assets are unavailable", async () => {
    await withLocalMockAdvancedMathRuntimeAssets(async () => {
      const install = await app.request("/api/local-runtimes/advanced-math/install", {
        method: "POST",
      })

      expect(install.status).toBe(200)
      await expect(install.json()).resolves.toMatchObject({
        state: "ready",
        ready: true,
      })
      expect(AdvancedMathRuntimeService.runtimeAssetInfo().baseUrl).toContain("releases/download")
    })
  })
})
