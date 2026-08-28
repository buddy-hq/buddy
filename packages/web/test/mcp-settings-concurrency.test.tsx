import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const ALPHA = "alpha"
const BETA = "beta"
const DIRECTORY = "/workspace/mcp-concurrency"

type RemoteMcpEntry = {
  type: "remote"
  url: string
  enabled: boolean
}

type GlobalMcpConfig = {
  mcp: Record<string, RemoteMcpEntry>
}

const GLOBAL_MCP_CONFIG: GlobalMcpConfig = {
  mcp: {
    [ALPHA]: { type: "remote", url: "https://alpha.example.com/mcp", enabled: true },
    [BETA]: { type: "remote", url: "https://beta.example.com/mcp", enabled: true },
  },
}

let currentConfig: GlobalMcpConfig = GLOBAL_MCP_CONFIG

type Deferred = {
  promise: Promise<GlobalMcpConfig>
  resolve: () => void
}

type SaveHandles = {
  settle?: (value: GlobalMcpConfig) => void
}

const savedNames: string[] = []
const savedEntries: RemoteMcpEntry[] = []
const pendingSaves = new Map<string, Deferred>()

/** Fails loudly when the save under test was never registered, instead of silently passing. */
function pendingSave(name: string): Deferred {
  const deferred = pendingSaves.get(name)
  if (!deferred) {
    throw new Error(`no pending save for ${name}`)
  }
  return deferred
}

/** A save that stays in flight until the test settles it, so two toggles can overlap. */
function deferSave(name: string): Deferred {
  const handles: SaveHandles = {}
  const promise = new Promise<GlobalMcpConfig>((settle) => {
    handles.settle = settle
  })
  const deferred: Deferred = {
    promise,
    resolve: () => handles.settle?.(currentConfig),
  }
  pendingSaves.set(name, deferred)
  return deferred
}

// Override only the mutation surface; the rest of these modules stays real so their other
// importers (the global config query, for one) keep their exports.
const actualProviderAuth = await import("../src/lib/provider-auth")
const actualChatActions = await import("../src/state/chat-actions")

mock.module("@/lib/provider-auth", () => ({
  ...actualProviderAuth,
  reloadProviderRuntime: async () => undefined,
}))

mock.module("@/state/chat-actions", () => ({
  ...actualChatActions,
  saveGlobalMcpConfig: (name: string, config: RemoteMcpEntry) => {
    savedNames.push(name)
    savedEntries.push(config)
    return deferSave(name).promise
  },
  removeGlobalMcpConfig: async () => ({}),
  resyncDirectory: async () => undefined,
  connectMcpServer: async () => ({}),
  authenticateMcpServer: async () => undefined,
}))

const { McpsSettings } = await import("../src/components/settings/settings-mcps")
const { globalConfigQueryKeys } = await import("../src/state/global-config-query")
const { mcpDirectoryQueryKeys } = await import("../src/state/mcp-directory-query")
const { useChatStore } = await import("../src/state/chat-store")

function switchFor(container: HTMLElement, name: string): HTMLButtonElement {
  const node = container.querySelector(`[data-action="settings-mcp-enabled-${name}"]`)
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error(`missing toggle for ${name}`)
  }
  return node
}

describe("MCP settings concurrency", () => {
  let container: HTMLElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    savedNames.length = 0
    savedEntries.length = 0
    currentConfig = GLOBAL_MCP_CONFIG
    pendingSaves.clear()
    useChatStore.setState({ openProjects: [DIRECTORY], activeDirectory: DIRECTORY })

    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(globalConfigQueryKeys.bundle(), GLOBAL_MCP_CONFIG)
    queryClient.setQueryData(mcpDirectoryQueryKeys.status(DIRECTORY), {})
    queryClient.setQueryData(mcpDirectoryQueryKeys.projectConfig(DIRECTORY), {})

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    queryClient.clear()
  })

  test("keeps each row busy until its own toggle settles", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <McpsSettings />
        </QueryClientProvider>,
      )
    })

    // Toggle alpha, then beta while alpha's runtime reload is still in flight.
    await act(async () => {
      switchFor(container, ALPHA).click()
    })
    await act(async () => {
      switchFor(container, BETA).click()
    })

    expect(switchFor(container, ALPHA).disabled).toBe(true)
    expect(switchFor(container, BETA).disabled).toBe(true)

    // Settling alpha must not clear beta's busy state.
    await act(async () => {
      const alphaSave = pendingSave(ALPHA)
      alphaSave.resolve()
      await alphaSave.promise
    })

    expect(switchFor(container, ALPHA).disabled).toBe(false)
    expect(switchFor(container, BETA).disabled).toBe(true)
  })

  test("serializes global config mutations so runtime reloads do not overlap", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <McpsSettings />
        </QueryClientProvider>,
      )
    })

    await act(async () => {
      switchFor(container, ALPHA).click()
    })
    await act(async () => {
      switchFor(container, BETA).click()
    })

    // Beta's write must wait for alpha's rewrite-and-reload to finish.
    expect(savedNames).toEqual([ALPHA])

    await act(async () => {
      const alphaSave = pendingSave(ALPHA)
      alphaSave.resolve()
      await alphaSave.promise
    })

    expect(savedNames).toEqual([ALPHA, BETA])
  })

  test("writes the config as it stands when the queued toggle runs", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <McpsSettings />
        </QueryClientProvider>,
      )
    })

    // Alpha's toggle goes first and holds the queue; beta's waits behind it.
    await act(async () => {
      switchFor(container, ALPHA).click()
    })
    await act(async () => {
      switchFor(container, BETA).click()
    })

    // While beta is queued, something else rewrites beta's URL in the cache.
    const rewrittenBeta: RemoteMcpEntry = {
      type: "remote",
      url: "https://beta.example.com/mcp/v2",
      enabled: true,
    }
    act(() => {
      currentConfig = { mcp: { ...GLOBAL_MCP_CONFIG.mcp, [BETA]: rewrittenBeta } }
      queryClient.setQueryData(globalConfigQueryKeys.bundle(), currentConfig)
    })

    await act(async () => {
      const alphaSave = pendingSave(ALPHA)
      alphaSave.resolve()
      await alphaSave.promise
    })

    // Beta's queued write must carry the rewritten URL, not the click-time snapshot.
    expect(savedNames).toEqual([ALPHA, BETA])
    expect(savedEntries.at(-1)?.url).toBe(rewrittenBeta.url)
  })
})
