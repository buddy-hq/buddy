import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { rmSync } from "node:fs"
import path from "node:path"
import type { FetchOpenCodeInput } from "../src/http/proxy/types"
import { ensureGlobalBootstrapWorkspaceDirectory } from "../src/project"
import { Global } from "../src/storage/global"

const originalDirectoryBase = process.env.BUDDY_DIRECTORY_BASE
const originalBuddyGlobalConfigDir = process.env.BUDDY_GLOBAL_CONFIG_DIR
const missingNotebookHome = path.join(Global.Path.home, "Documents", "Buddy Missing Bootstrap Test")
const bootstrapConfigDir = path.join(Global.Path.home, ".buddy-bootstrap-routes-test")

const proxiedRequests: FetchOpenCodeInput[] = []

mock.module("../src/http/proxy/fetch.ts", () => ({
  fetchOpenCode: async (input: FetchOpenCodeInput) => {
    proxiedRequests.push(input)
    return Response.json({
      path: input.path,
      directory: input.directory ?? null,
      query: input.query ?? "",
    })
  },
}))

const { app } = await import("../src/index.ts")

describe("global bootstrap routes", () => {
  beforeEach(() => {
    proxiedRequests.length = 0
    rmSync(missingNotebookHome, { recursive: true, force: true })
    rmSync(bootstrapConfigDir, { recursive: true, force: true })
    process.env.BUDDY_DIRECTORY_BASE = missingNotebookHome
    process.env.BUDDY_GLOBAL_CONFIG_DIR = bootstrapConfigDir
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
      delete process.env.BUDDY_GLOBAL_CONFIG_DIR
    } else {
      process.env.BUDDY_GLOBAL_CONFIG_DIR = originalBuddyGlobalConfigDir
    }
  })

  test("serves compatibility health without requiring notebook home access", async () => {
    const response = await app.request("/api/health")

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      path: "/global/health",
      directory: null,
      query: "",
    })
    expect(proxiedRequests).toHaveLength(1)
    expect(proxiedRequests[0]).toMatchObject({
      path: "/global/health",
      directory: undefined,
      query: "",
    })
  })

  test("loads provider bootstrap routes without a workspace directory", async () => {
    const bootstrapDirectory = ensureGlobalBootstrapWorkspaceDirectory()
    const [providerResponse, providerAuthResponse] = await Promise.all([
      app.request("/api/provider"),
      app.request("/api/provider/auth"),
    ])

    expect(providerResponse.status).toBe(200)
    await expect(providerResponse.json()).resolves.toEqual({
      path: "/provider",
      directory: bootstrapDirectory,
      query: "",
    })

    expect(providerAuthResponse.status).toBe(200)
    await expect(providerAuthResponse.json()).resolves.toEqual({
      path: "/provider/auth",
      directory: bootstrapDirectory,
      query: "",
    })

    expect(proxiedRequests).toHaveLength(2)
    expect(proxiedRequests).toMatchObject([
      {
        path: "/provider",
        directory: bootstrapDirectory,
        query: "",
      },
      {
        path: "/provider/auth",
        directory: bootstrapDirectory,
        query: "",
      },
    ])
  })

  test("validates optional directories only when one is explicitly provided", async () => {
    const existingDirectory = process.cwd()
    const missingDirectory = path.join(existingDirectory, "missing-bootstrap-project")
    rmSync(missingDirectory, { recursive: true, force: true })

    const explicitResponse = await app.request(
      `/api/provider?directory=${encodeURIComponent(existingDirectory)}`,
    )
    expect(explicitResponse.status).toBe(200)
    await expect(explicitResponse.json()).resolves.toEqual({
      path: "/provider",
      directory: existingDirectory,
      query: `?directory=${encodeURIComponent(existingDirectory)}`,
    })

    const missingResponse = await app.request(
      `/api/provider?directory=${encodeURIComponent(missingDirectory)}`,
    )
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toEqual({
      error: `Directory not found: ${missingDirectory}`,
    })

    expect(proxiedRequests).toHaveLength(1)
    expect(proxiedRequests[0]).toMatchObject({
      path: "/provider",
      directory: existingDirectory,
    })
  })
})
