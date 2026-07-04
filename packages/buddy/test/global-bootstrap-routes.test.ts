import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import path from "node:path"
import { BUDDY_ENV } from "../src/storage/constants"
import { Global } from "../src/storage/global"

const originalDirectoryBase = process.env.BUDDY_DIRECTORY_BASE
const originalBuddyGlobalConfigDir = process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR]
const missingNotebookHome = path.join(Global.Path.home, "Documents", "Buddy Missing Bootstrap Test")
const bootstrapConfigDir = path.join(Global.Path.home, ".buddy-bootstrap-routes-test")

const { app } = await import("../src/index.ts")

describe("global bootstrap routes", () => {
  beforeEach(() => {
    rmSync(missingNotebookHome, { recursive: true, force: true })
    rmSync(bootstrapConfigDir, { recursive: true, force: true })
    process.env.BUDDY_DIRECTORY_BASE = missingNotebookHome
    process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR] = bootstrapConfigDir
  })

  afterEach(() => {
    rmSync(missingNotebookHome, { recursive: true, force: true })
    rmSync(bootstrapConfigDir, { recursive: true, force: true })
    if (originalDirectoryBase === undefined) {
      delete process.env.BUDDY_DIRECTORY_BASE
    } else {
      process.env.BUDDY_DIRECTORY_BASE = originalDirectoryBase
    }
    if (originalBuddyGlobalConfigDir === undefined) {
      delete process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR]
    } else {
      process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR] = originalBuddyGlobalConfigDir
    }
  })

  test("serves compatibility health without requiring notebook home access", async () => {
    const response = await app.request("/api/health")

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      healthy: true,
      version: expect.any(String),
    })
  })

  test("loads provider bootstrap routes without a workspace directory", async () => {
    const [providerResponse, providerAuthResponse] = await Promise.all([
      app.request("/api/provider"),
      app.request("/api/provider/auth"),
    ])

    expect(providerResponse.status).toBe(200)
    await expect(providerResponse.json()).resolves.toMatchObject({
      all: expect.any(Array),
      default: expect.any(Object),
      connected: expect.any(Array),
    })

    expect(providerAuthResponse.status).toBe(200)
    await expect(providerAuthResponse.json()).resolves.toEqual(expect.any(Object))
  })

  test("validates optional directories only when one is explicitly provided", async () => {
    const existingDirectory = process.cwd()
    const missingDirectory = path.join(existingDirectory, "missing-bootstrap-project")
    rmSync(missingDirectory, { recursive: true, force: true })

    const explicitResponse = await app.request(
      `/api/provider?directory=${encodeURIComponent(existingDirectory)}`,
    )
    expect(explicitResponse.status).toBe(200)
    await expect(explicitResponse.json()).resolves.toMatchObject({
      all: expect.any(Array),
      default: expect.any(Object),
      connected: expect.any(Array),
    })

    const missingResponse = await app.request(
      `/api/provider?directory=${encodeURIComponent(missingDirectory)}`,
    )
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toEqual({
      error: `Directory not found: ${missingDirectory}`,
    })
  })
})
