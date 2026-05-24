import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ENV,
} from "../src/learning/features/standards/constants"
import { resolveSessionRuntime } from "../src/learning/access/resolve-session-runtime"
import { syncBuddyRuntimeSessionPermissions } from "../src/learning/agent-execution/permissions/runtime-session-permissions"
import {
  clearAllTeachingSessionState,
  writeTeachingSessionState,
} from "../src/learning/agent-execution/state/session-state"
import { REGISTERED_BUDDY_PERSONAS } from "../src/learning/personas/registry"
import { getBuddyPersona } from "../src/learning/personas/wiring/persona-profiles"
import { app } from "../src/index.ts"
import { AdvancedMathRuntimeService } from "../src/local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../src/local-runtimes/standards/service"
import { loadOpenCodeApp } from "../src/opencode-runtime"
import { syncOpenCodeProjectConfig } from "../src/config/runtime/opencode-sync"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import {
  withLocalMockAdvancedMathRuntimeAssets,
  withMockAdvancedMathRuntimeAssets,
} from "./helpers/advanced-math-runtime"
import {
  withLocalMockStandardsRuntimeAssets,
  withMockStandardsRuntimeAssets,
  withWritableLocalMockStandardsRuntimeAssets,
} from "./helpers/standards-runtime"
import { tmpdir } from "./helpers/tmpdir"

const AUTO_UPDATE_POLL_ATTEMPTS = 50
const AUTO_UPDATE_POLL_INTERVAL_MS = 20
const INVALID_CHECKSUM = "0000000000000000000000000000000000000000000000000000000000000000"

afterEach(async () => {
  clearAllTeachingSessionState()
  await OpenCodeInstance.disposeAll()
})

async function createSession(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const session = await OpenCodeSession.create()
      return session.id
    },
  })
}

async function seedBuddyPersonaRuntime(directory: string, sessionID: string) {
  const projectConfig = await readProjectConfig(directory)
  const persona = getBuddyPersona("buddy", projectConfig.personas)
  const personaDefinition = REGISTERED_BUDDY_PERSONAS.find((entry) => entry.id === "buddy")
  if (!personaDefinition) {
    throw new Error('Unknown Buddy persona "buddy"')
  }

  const sessionRuntime = resolveSessionRuntime({
    persona: {
      id: persona.id,
      features: personaDefinition.features,
      defaultSurface: persona.defaultSurface,
    },
    teachingWorkspaceState: "inactive",
    configuredToolToggles: projectConfig.tools,
  })

  writeTeachingSessionState(directory, {
    sessionId: sessionID,
    persona: "buddy",
    currentSurface: persona.defaultSurface,
    teachingWorkspaceState: "inactive",
    sessionRuntime,
    focusGoalIds: [],
  })

  await syncBuddyRuntimeSessionPermissions({
    directory,
    sessionID,
    sessionRuntime,
  })
}

async function readPermissionAction(input: {
  directory: string
  permission: string
  sessionID: string
}) {
  const session = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () => OpenCodeSession.get(SessionID.make(input.sessionID)),
  })

  return PermissionNext.evaluate(input.permission, "*", session.permission ?? []).action
}

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

  test("refreshes Buddy session permissions immediately after standards install and removal", async () => {
    await withMockStandardsRuntimeAssets(async () => {
      await using project = await tmpdir({ git: true })
      await syncOpenCodeProjectConfig(project.path)
      await loadOpenCodeApp()

      const sessionID = await createSession(project.path)
      await seedBuddyPersonaRuntime(project.path, sessionID)

      expect(
        await readPermissionAction({
          directory: project.path,
          permission: "search_standards",
          sessionID,
        }),
      ).toBe("deny")

      const install = await app.request("/api/local-runtimes/standards/install", {
        method: "POST",
        headers: {
          "x-buddy-directory": project.path,
        },
      })
      expect(install.status).toBe(200)

      expect(
        await readPermissionAction({
          directory: project.path,
          permission: "search_standards",
          sessionID,
        }),
      ).toBe("allow")

      const remove = await app.request("/api/local-runtimes/standards/install", {
        method: "DELETE",
        headers: {
          "x-buddy-directory": project.path,
        },
      })
      expect(remove.status).toBe(200)

      expect(
        await readPermissionAction({
          directory: project.path,
          permission: "search_standards",
          sessionID,
        }),
      ).toBe("deny")
    })
  })

  test("auto-updates installed standards when the bundled dataset version changes", async () => {
    await withWritableLocalMockStandardsRuntimeAssets(async ({ writeBundle }) => {
      const initialManifest = await writeBundle({
        marker: "v1",
        version: "test-standards-v1",
      })
      const initialInstall = await StandardsRuntimeService.install()
      expect(initialInstall).toMatchObject({
        state: "ready",
        ready: true,
        installedDatasetVersion: initialManifest.version,
        installedArchiveChecksum: initialManifest.archiveChecksum,
      })

      const updatedManifest = await writeBundle({
        marker: "v2",
        version: "test-standards-v2",
      })

      const statusBeforeAutoUpdate = await StandardsRuntimeService.getStatus()
      expect(statusBeforeAutoUpdate.ready).toBe(true)
      expect(statusBeforeAutoUpdate.installedDatasetVersion).toBe(initialManifest.version)

      let currentStatus = statusBeforeAutoUpdate
      for (let attempt = 0; attempt < AUTO_UPDATE_POLL_ATTEMPTS; attempt += 1) {
        await Bun.sleep(AUTO_UPDATE_POLL_INTERVAL_MS)
        currentStatus = await StandardsRuntimeService.getStatus()
        if (
          currentStatus.ready &&
          currentStatus.installedDatasetVersion === updatedManifest.version &&
          currentStatus.installedArchiveChecksum === updatedManifest.archiveChecksum
        ) {
          break
        }
      }

      expect(currentStatus).toMatchObject({
        state: "ready",
        ready: true,
        installedDatasetVersion: updatedManifest.version,
        installedArchiveChecksum: updatedManifest.archiveChecksum,
      })
    })
  })

  test("preserves the current standards install when an automatic update fails", async () => {
    await withWritableLocalMockStandardsRuntimeAssets(async ({ localAssetRoot, writeBundle }) => {
      const initialManifest = await writeBundle({
        marker: "v1",
        version: "test-standards-stable",
      })
      const initialInstall = await StandardsRuntimeService.install()
      expect(initialInstall).toMatchObject({
        state: "ready",
        ready: true,
        installedDatasetVersion: initialManifest.version,
        installedArchiveChecksum: initialManifest.archiveChecksum,
      })

      const brokenManifest = await writeBundle({
        marker: "broken",
        version: "test-standards-broken",
      })
      await fs.writeFile(
        path.join(localAssetRoot, KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME),
        `${INVALID_CHECKSUM}  learning-commons-knowledge-graph.db.zst\n`,
        "utf8",
      )

      const statusBeforeAutoUpdate = await StandardsRuntimeService.getStatus()
      expect(statusBeforeAutoUpdate.ready).toBe(true)
      expect(statusBeforeAutoUpdate.installedDatasetVersion).toBe(initialManifest.version)

      let currentStatus = statusBeforeAutoUpdate
      for (let attempt = 0; attempt < AUTO_UPDATE_POLL_ATTEMPTS; attempt += 1) {
        await Bun.sleep(AUTO_UPDATE_POLL_INTERVAL_MS)
        currentStatus = await StandardsRuntimeService.getStatus()
        if (!StandardsRuntimeService.isOperationInProgress()) {
          break
        }
      }

      expect(currentStatus).toMatchObject({
        state: "ready",
        ready: true,
        installedDatasetVersion: initialManifest.version,
        installedArchiveChecksum: initialManifest.archiveChecksum,
      })
      expect(currentStatus.installedDatasetVersion).not.toBe(brokenManifest.version)
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
