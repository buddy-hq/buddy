import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { KNOWLEDGE_GRAPH_DB_ENV } from "../src/learning/knowledge-graph/constants"
import { app } from "../src/index.ts"
import { AdvancedMathRuntimeService } from "../src/local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../src/local-runtimes/standards/service"
import {
  withLocalMockAdvancedMathRuntimeAssets,
  withMockAdvancedMathRuntimeAssets,
} from "./helpers/advanced-math-runtime"
import {
  withLocalMockStandardsRuntimeAssets,
  withMockStandardsRuntimeAssets,
} from "./helpers/standards-runtime"

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

  test("installs and removes standards through the API", async () => {
    await withMockStandardsRuntimeAssets(async () => {
      const before = await app.request("/api/local-runtimes/standards")
      expect(before.status).toBe(200)
      await expect(before.json()).resolves.toMatchObject({
        ready: false,
      })

      const install = await app.request("/api/local-runtimes/standards/install", {
        method: "POST",
      })
      expect(install.status).toBe(200)
      await expect(install.json()).resolves.toMatchObject({
        state: "ready",
        ready: true,
      })

      const afterInstall = await app.request("/api/local-runtimes/standards")
      expect(afterInstall.status).toBe(200)
      await expect(afterInstall.json()).resolves.toMatchObject({
        state: "ready",
        ready: true,
      })

      const remove = await app.request("/api/local-runtimes/standards/install", {
        method: "DELETE",
      })
      expect(remove.status).toBe(200)
      await expect(remove.json()).resolves.toMatchObject({
        state: "not_installed",
        ready: false,
      })
    })
  })

  test("installs standards from a local development asset when release assets are unavailable", async () => {
    await withLocalMockStandardsRuntimeAssets(async () => {
      const install = await app.request("/api/local-runtimes/standards/install", {
        method: "POST",
      })

      expect(install.status).toBe(200)
      await expect(install.json()).resolves.toMatchObject({
        state: "ready",
        ready: true,
      })
      expect(StandardsRuntimeService.runtimeAssetInfo().baseUrl).toContain("releases/download")
    })
  })

  test("treats configured knowledge graph env overrides as ready for standards gating", async () => {
    const previousDatabasePath = process.env[KNOWLEDGE_GRAPH_DB_ENV]
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-knowledge-graph-env-"))
    const databasePath = path.join(tempDir, "knowledge-graph.db")
    await fs.writeFile(databasePath, "sqlite-placeholder", "utf8")
    await StandardsRuntimeService.remove().catch(() => undefined)
    process.env[KNOWLEDGE_GRAPH_DB_ENV] = databasePath

    try {
      expect(StandardsRuntimeService.isReady()).toBe(true)

      const status = await StandardsRuntimeService.getStatus()
      expect(status.ready).toBe(true)
      expect(status.databasePath).toBe(databasePath)

      const response = await app.request("/api/local-runtimes/standards")
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        ready: true,
        databasePath,
      })
    } finally {
      if (previousDatabasePath === undefined) {
        delete process.env[KNOWLEDGE_GRAPH_DB_ENV]
      } else {
        process.env[KNOWLEDGE_GRAPH_DB_ENV] = previousDatabasePath
      }
      await StandardsRuntimeService.remove().catch(() => undefined)
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
