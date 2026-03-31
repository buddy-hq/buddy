import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { test as base, expect, type Page } from "@playwright/test"
import { chatEntryPageSelector, directoryChatShellSelector } from "./selectors"

const BACKEND_HOST = process.env.PLAYWRIGHT_BACKEND_HOST ?? "127.0.0.1"
const BACKEND_PORT = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? "3900")

export const backendUrl =
  process.env.PLAYWRIGHT_BACKEND_URL ?? `http://${BACKEND_HOST}:${BACKEND_PORT}`

const FRONTEND_STORAGE_KEYS = [
  "buddy.chat.v4",
  "buddy.prompt.v1",
  "buddy.ui.v1",
  "buddy.onboarding.v1",
  "opencode-theme-id",
  "opencode-color-scheme",
  "opencode-theme-cache-version",
  "opencode-theme-css-light",
  "opencode-theme-css-dark",
]
const E2E_PLATFORM_OVERRIDES_STORAGE_KEY = "buddy.e2e.platform.overrides"
const E2E_SEED_STATE_STORAGE_KEY = "buddy.e2e.seeded"

function encodeDirectoryToken(directory: string) {
  return Buffer.from(directory, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function withDirectoryQuery(endpoint: string, directory: string) {
  const url = new URL(endpoint, backendUrl)
  url.searchParams.set("directory", directory)
  return `${url.pathname}${url.search}`
}

type E2EResetPayload = {
  clearOpenProjects?: boolean
  disposeInstances?: boolean
  clearTeachingState?: boolean
}

type E2EFaultPayload = {
  failNextPromptMessage?: string
  failNextCommandMessage?: string
}

type E2EProviderPayload = {
  openAIConnected: boolean
}

type E2EProviderPatchPayload = {
  openAIConnected?: boolean
}

export class BuddyE2EApi {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(
    endpoint: string,
    init?: {
      method?: string
      body?: unknown
      headers?: HeadersInit
    },
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: init?.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })

    const text = await response.text()
    const payload = text.length > 0 ? JSON.parse(text) : undefined

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error)
          : `Request failed (${response.status})`
      throw new Error(message)
    }

    return payload as T
  }

  getState() {
    return this.request<{
      mode: "enabled"
      runtime: {
        faults: E2EFaultPayload
        counters: { promptCalls: number; commandCalls: number }
        providers: E2EProviderPayload
      }
    }>("/api/e2e/state")
  }

  reset(payload?: E2EResetPayload) {
    return this.request<{
      ok: true
      runtime: {
        faults: E2EFaultPayload
        counters: { promptCalls: number; commandCalls: number }
        providers: E2EProviderPayload
      }
    }>("/api/e2e/reset", {
      method: "POST",
      body: payload ?? {},
    })
  }

  setFaults(payload: E2EFaultPayload) {
    return this.request<{ ok: true }>("/api/e2e/faults", {
      method: "PUT",
      body: payload,
    })
  }

  setProviders(payload: E2EProviderPatchPayload) {
    return this.request<{ ok: true }>("/api/e2e/providers", {
      method: "PUT",
      body: payload,
    })
  }

  setOpenProjects(directories: string[]) {
    return this.request<{ ok: true; directories: string[] }>("/api/e2e/open-projects", {
      method: "PUT",
      body: { directories },
    })
  }

  seedSession(payload: {
    directory: string
    sessionID?: string
    title?: string
    turnCount?: number
    includeAssistant?: boolean
    longAssistantChars?: number
    archived?: boolean
  }) {
    return this.request<{ ok: true; sessionID: string }>("/api/e2e/seed/session", {
      method: "POST",
      body: payload,
    })
  }

  seedTeachingWorkspace(payload: {
    directory: string
    sessionID?: string
    title?: string
    language?: string
    relativePath?: string
    code?: string
    teaching?: {
      persona?: string
      intent?: string
      focusGoalIds?: string[]
    }
  }) {
    return this.request<{ ok: true; sessionID: string }>("/api/e2e/seed/teaching-workspace", {
      method: "POST",
      body: payload,
    })
  }

  seedMermaid(payload: {
    directory: string
    artifacts: Array<{
      source: string
      alt: string
      caption?: string
      diagramType?: string
    }>
  }) {
    return this.request<{ ok: true; artifactIDs: string[] }>("/api/e2e/seed/mermaid", {
      method: "POST",
      body: payload,
    })
  }

  emitSessionError(payload: { directory: string; sessionID?: string; message: string }) {
    return this.request<{ ok: true }>("/api/e2e/emit/session-error", {
      method: "POST",
      body: payload,
    })
  }

  emitInstanceDisposed(payload: { directory: string }) {
    return this.request<{ ok: true }>("/api/e2e/emit/instance-disposed", {
      method: "POST",
      body: payload,
    })
  }

  listOpenProjects() {
    return this.request<{ directories: string[] }>("/api/open-projects")
  }

  listSessions(directory: string) {
    return this.request<Array<{ id: string; title: string }>>(
      withDirectoryQuery("/api/session", directory),
    )
  }

  listSessionMessages(directory: string, sessionID: string) {
    return this.request<
      Array<{ info: { id: string; role: string }; parts: Array<{ type: string; text?: string }> }>
    >(withDirectoryQuery(`/api/session/${encodeURIComponent(sessionID)}/message`, directory))
  }

  readProjectConfig(directory: string) {
    return this.request<Record<string, unknown>>(withDirectoryQuery("/api/config", directory))
  }

  patchProjectConfig(directory: string, patch: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(withDirectoryQuery("/api/config", directory), {
      method: "PATCH",
      body: patch,
    })
  }

  putMcpConfig(directory: string, name: string, config: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      withDirectoryQuery(`/api/config/mcp/${encodeURIComponent(name)}`, directory),
      {
        method: "PUT",
        body: config,
      },
    )
  }

  listResources(directory: string) {
    return this.request<{ resources: Array<{ id: string; alias: string; status: string }> }>(
      withDirectoryQuery("/api/resource", directory),
    )
  }

  addResource(directory: string, payload: { sourcePath: string; alias?: string }) {
    return this.request<{ id: string; alias: string; status: string }>(
      withDirectoryQuery("/api/resource", directory),
      {
        method: "POST",
        body: payload,
      },
    )
  }

  renameResource(directory: string, resourceKey: string, alias: string) {
    return this.request<{ id: string; alias: string; status: string }>(
      withDirectoryQuery(`/api/resource/${encodeURIComponent(resourceKey)}`, directory),
      {
        method: "PATCH",
        body: { alias },
      },
    )
  }

  rebuildResource(directory: string, resourceKey: string) {
    return this.request<{ id: string; alias: string; status: string }>(
      withDirectoryQuery(`/api/resource/${encodeURIComponent(resourceKey)}/rebuild`, directory),
      {
        method: "POST",
      },
    )
  }

  removeResource(directory: string, resourceKey: string) {
    return this.request<{ ok: true }>(
      withDirectoryQuery(`/api/resource/${encodeURIComponent(resourceKey)}`, directory),
      {
        method: "DELETE",
      },
    )
  }
}

type TestFixtures = {
  createNotebook: (input?: { name?: string; files?: Record<string, string> }) => Promise<string>
  createNotebookFile: (directory: string, relativePath: string, content: string) => Promise<string>
  gotoChat: () => Promise<void>
  gotoDirectoryChat: (directory: string) => Promise<void>
  _resetBackend: void
}

type WorkerFixtures = {
  workspaceRoot: string
  backendUrl: string
  e2e: BuddyE2EApi
}

async function writeNotebookFiles(directory: string, files: Record<string, string>) {
  const entries = Object.entries(files)
  await Promise.all(
    entries.map(async ([relativePath, content]) => {
      const target = path.join(directory, relativePath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content, "utf8")
    }),
  )
}

async function seedDriver(page: Page) {
  await page.addInitScript(
    (input) => {
      const { storageKeys, platformOverrideStorageKey, seedStateStorageKey } = input
      const hasSeededState = sessionStorage.getItem(seedStateStorageKey) === "1"

      if (!hasSeededState) {
        for (const key of storageKeys) {
          localStorage.removeItem(key)
        }
        localStorage.removeItem(platformOverrideStorageKey)
        sessionStorage.removeItem(platformOverrideStorageKey)
        sessionStorage.setItem(seedStateStorageKey, "1")
      }

      const persistedOverrides = (() => {
        const raw = sessionStorage.getItem(platformOverrideStorageKey)
        if (!raw) return {}
        try {
          const parsed = JSON.parse(raw)
          return parsed && typeof parsed === "object" ? parsed : {}
        } catch {
          return {}
        }
      })()

      const current = window.__BUDDY_E2E__ ?? {}
      window.__BUDDY_E2E__ = {
        enabled: true,
        platform: {
          overrides: {
            ...persistedOverrides,
            ...current.platform?.overrides,
          },
          calls: current.platform?.calls ?? {
            startWindowDragging: 0,
            toggleWindowMaximize: 0,
            openDirectoryPickerDialog: 0,
            openFilePickerDialog: 0,
            checkUpdate: 0,
            update: 0,
            restart: 0,
          },
        },
        prompt: {
          current: current.prompt?.current ?? {
            popover: "none",
            slash: { ids: [] },
            mention: { ids: [] },
            selects: 0,
            submissions: 0,
          },
        },
        sync: {
          status: "idle",
          controlsCount: 0,
          disconnect: () => undefined,
          reconnect: () => undefined,
        },
      }
    },
    {
      storageKeys: FRONTEND_STORAGE_KEYS,
      platformOverrideStorageKey: E2E_PLATFORM_OVERRIDES_STORAGE_KEY,
      seedStateStorageKey: E2E_SEED_STATE_STORAGE_KEY,
    },
  )
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  workspaceRoot: [
    async ({ browserName: _browserName }, use) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-e2e-notebooks-"))
      await use(root)
      await fs.rm(root, { recursive: true, force: true })
    },
    { scope: "worker" },
  ],
  backendUrl: [
    async ({ browserName: _browserName }, use) => {
      await use(backendUrl)
    },
    { scope: "worker" },
  ],
  page: async ({ page }, use) => {
    await seedDriver(page)
    await use(page)
  },
  e2e: [
    async ({ backendUrl }, use) => {
      await use(new BuddyE2EApi(backendUrl))
    },
    { scope: "worker" },
  ],
  createNotebook: async ({ workspaceRoot }, use) => {
    await use(async (input) => {
      const name = input?.name?.trim() || `notebook-${randomUUID().slice(0, 8)}`
      const directory = path.join(workspaceRoot, name)
      await fs.mkdir(directory, { recursive: true })

      const files = input?.files ?? { "README.md": `# ${name}\n\nE2E seeded notebook.` }
      await writeNotebookFiles(directory, files)
      return fs.realpath(directory)
    })
  },
  createNotebookFile: async ({ page: _page }, use) => {
    await use(async (directory, relativePath, content) => {
      const target = path.join(directory, relativePath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content, "utf8")
      return fs.realpath(target)
    })
  },
  gotoChat: async ({ page }, use) => {
    await use(async () => {
      await page.goto("/chat")
      await expect(page.locator(chatEntryPageSelector)).toBeVisible()
    })
  },
  gotoDirectoryChat: async ({ page }, use) => {
    await use(async (directory) => {
      const token = encodeDirectoryToken(directory)
      await page.goto(`/${token}/chat`)
      await expect(page.locator(directoryChatShellSelector)).toBeVisible()
    })
  },
  // Keep backend state deterministic across tests.
  _resetBackend: [
    async ({ e2e }, use) => {
      await e2e.reset({
        clearOpenProjects: true,
        clearTeachingState: true,
        disposeInstances: true,
      })
      await use()
    },
    { auto: true },
  ],
})

export { expect }
