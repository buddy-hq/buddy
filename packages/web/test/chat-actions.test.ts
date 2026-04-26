import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  abortPrompt,
  closeOpenProject,
  ensureDirectorySession,
  loadCurriculumView,
  loadMessages,
  loadSessions,
  loadRuntimeCapabilities,
  loadOpenProjects,
  openProject,
  reorderOpenProjects,
  resolveDefaultPersonaID,
  selectSession,
  sendPrompt,
  startNewSession,
  shouldDeferTranscriptReload,
} from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import {
  getModelSelectionScopeKey,
  useModelSelectionStore,
} from "../src/state/model-selection-store"
import {
  createAssistantMessageInfo,
  createDirectoryChatState,
  createFetchStub,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"
import { BUSY_SESSION_STATUS, IDLE_SESSION_STATUS } from "../src/state/session-status"

const originalFetch = globalThis.fetch

function hasStringUrl(value: unknown): value is { url: string } {
  return Boolean(
    value && typeof value === "object" && "url" in value && typeof value.url === "string",
  )
}

function hasStringMethod(value: unknown): value is { method: string } {
  return Boolean(
    value && typeof value === "object" && "method" in value && typeof value.method === "string",
  )
}

function hasHeaders(value: unknown): value is { headers: HeadersInit } {
  return Boolean(value && typeof value === "object" && "headers" in value)
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.toString()
  if (hasStringUrl(input)) return input.url
  return String(input)
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method
  if (hasStringMethod(input)) return input.method
  return undefined
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.headers) return new Headers(init.headers)
  if (hasHeaders(input)) return new Headers(input.headers)
  return new Headers()
}

function resetStore() {
  useChatStore.setState({
    openProjects: [],
    activeDirectory: undefined,
    pendingActiveDirectory: undefined,
    entryError: undefined,
    lastSessionByDirectory: {},
    selectedModelByDirectory: {},
    directories: {},
    streamStatus: "idle",
  })
  useModelSelectionStore.setState({
    selectionSourceByKey: {},
    restoredSelectionCreatedAtByKey: {},
    selectedAgentByKey: {},
    selectedModelByKey: {},
    selectedVariantByKey: {},
    recentModelKeys: [],
  })
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("loadOpenProjects", () => {
  test("hydrates normalized open projects from the backend instead of local storage", async () => {
    localStorage.setItem(
      "buddy.chat.v4",
      JSON.stringify({
        state: {
          openProjects: ["/polluted/local", "/polluted/other"],
          activeDirectory: "/polluted/local",
        },
        version: 0,
      }),
    )

    globalThis.fetch = createFetchStub(async (input, init) => {
      expect(new URL(requestUrl(input), "http://localhost").pathname).toBe("/api/open-projects")
      expect(requestMethod(input, init)).toBe("GET")
      expect(requestHeaders(input, init).get("x-buddy-directory")).toBeNull()
      return new Response(
        JSON.stringify({
          directories: ["/repo/root", "/repo/root/", " /repo/other/ ", "/"],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    const projects = await loadOpenProjects()

    expect(projects).toEqual(["/repo/root", "/repo/other"])
    expect(useChatStore.getState().openProjects).toEqual(["/repo/root", "/repo/other"])
  })
})

describe("chat store model selection", () => {
  test("tracks selected models per directory without changing other directories", () => {
    const store = useChatStore.getState()

    store.setSelectedModel("/repo/a", "anthropic/claude-sonnet-4")
    store.setSelectedModel("/repo/b", "openai/gpt-5")
    store.setSelectedModel("/repo/a", "auto")

    expect(useChatStore.getState().selectedModelByDirectory).toEqual({
      "/repo/a": "auto",
      "/repo/b": "openai/gpt-5",
    })
  })
})

describe("openProject", () => {
  test("stores the canonical directory returned by the backend", async () => {
    globalThis.fetch = createFetchStub(async (_input, init) => {
      expect(init?.method).toBe("POST")
      expect(new Headers(init?.headers).get("x-buddy-directory")).toBeNull()
      expect(init?.body).toBe(JSON.stringify({ directory: "/repo/nested" }))
      return new Response(
        JSON.stringify({
          directory: "/repo",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    const nextDirectory = await openProject("/repo/nested/")

    expect(nextDirectory).toBe("/repo")
    expect(useChatStore.getState().openProjects).toEqual(["/repo"])
  })

  test("allows non-git folders", async () => {
    globalThis.fetch = createFetchStub(
      async () =>
        new Response(
          JSON.stringify({
            directory: "/tmp",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    )

    const nextDirectory = await openProject("/tmp")

    expect(nextDirectory).toBe("/tmp")
    expect(useChatStore.getState().openProjects).toEqual(["/tmp"])
  })

  test("surfaces backend validation failures without opening the project", async () => {
    globalThis.fetch = createFetchStub(
      async () =>
        new Response(JSON.stringify({ error: "Directory is outside allowed roots" }), {
          status: 403,
          headers: {
            "content-type": "application/json",
          },
        }),
    )

    await expect(openProject("../repo")).rejects.toThrow("Directory is outside allowed roots")
    expect(useChatStore.getState().openProjects).toEqual([])
  })

  test("rejects the filesystem root", async () => {
    await expect(openProject("/")).rejects.toThrow("Please choose a notebook directory, not /")
    expect(useChatStore.getState().openProjects).toEqual([])
  })
})

describe("closeOpenProject", () => {
  test("removes a directory from the in-memory store through the backend API", async () => {
    useChatStore.setState({
      openProjects: ["/repo", "/other"],
      activeDirectory: "/repo",
      directories: {
        "/repo": {
          sessionTitle: "New thread",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          pendingQuestions: [],
          providers: [],
          providerDefault: {},
          mcpStatus: {},
          isBusy: false,
          isReady: false,
        },
        "/other": {
          sessionTitle: "New thread",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          pendingQuestions: [],
          providers: [],
          providerDefault: {},
          mcpStatus: {},
          isBusy: false,
          isReady: false,
        },
      },
    })

    globalThis.fetch = createFetchStub(async (input, init) => {
      expect(String(input)).toBe("/api/open-projects?directory=%2Frepo")
      expect(init?.method).toBe("DELETE")
      return new Response(JSON.stringify({ directory: "/repo" }), {
        headers: {
          "content-type": "application/json",
        },
      })
    })

    await expect(closeOpenProject("/repo")).resolves.toBe("/repo")
    expect(useChatStore.getState().openProjects).toEqual(["/other"])
    expect(useChatStore.getState().activeDirectory).toBe("/other")
  })
})

describe("reorderOpenProjects", () => {
  test("uses the backend response order as the notebook order", async () => {
    useChatStore.setState({
      openProjects: ["/repo/one", "/repo/two"],
    })

    globalThis.fetch = createFetchStub(async (input, init) => {
      expect(String(input)).toBe("/api/open-projects/order")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBe(JSON.stringify({ directories: ["/repo/two", "/repo/one"] }))
      return new Response(
        JSON.stringify({
          directories: ["/repo/two", "/repo/one"],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    await expect(reorderOpenProjects(["/repo/two", "/repo/one"])).resolves.toEqual([
      "/repo/two",
      "/repo/one",
    ])
    expect(useChatStore.getState().openProjects).toEqual(["/repo/two", "/repo/one"])
  })
})

describe("ensureDirectorySession", () => {
  test("reuses a ready directory without reloading the transcript", async () => {
    const existingSession = {
      id: "session-1",
      title: "Existing thread",
      time: {
        created: 1,
        updated: 2,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {
        "/repo": existingSession.id,
      },
      directories: {
        "/repo": {
          sessionID: existingSession.id,
          sessionTitle: existingSession.title,
          sessions: [existingSession],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          pendingQuestions: [],
          providers: [],
          providerDefault: {},
          mcpStatus: {},
          isBusy: false,
          isReady: true,
        },
      },
    })

    globalThis.fetch = createFetchStub(async () => {
      throw new Error(
        "ensureDirectorySession should not fetch when directory state is already ready",
      )
    })

    await expect(ensureDirectorySession("/repo")).resolves.toEqual({
      directory: "/repo",
      info: existingSession,
    })
  })

  test("keeps the directory in draft mode when no sessions exist", async () => {
    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {},
      directories: {},
    })

    let createRequests = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session") {
        createRequests += 1
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/permission") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/provider") {
        return new Response(
          JSON.stringify({
            default: "",
            connected: [],
            all: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/provider/auth") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/config/mcp/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const result = await ensureDirectorySession("/repo")

    expect(createRequests).toBe(0)
    expect(result).toEqual({
      directory: "/repo",
      info: undefined,
    })
    expect(useChatStore.getState().directories["/repo"]?.sessionID).toBeUndefined()
    expect(useChatStore.getState().directories["/repo"]?.isDraft).toBe(true)
  })

  test("recovers when selecting a stale session after backend restart", async () => {
    const staleSession = {
      id: "session_stale",
      title: "Stale session",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {
        "/repo": staleSession.id,
      },
      directories: {
        "/repo": createDirectoryChatState({
          sessionID: staleSession.id,
          sessionTitle: staleSession.title,
          sessions: [staleSession],
          isDraft: false,
          isReady: true,
        }),
      },
    })

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session/session_stale/message") {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await selectSession("/repo", staleSession.id)

    const next = useChatStore.getState().directories["/repo"]
    expect(next?.isDraft).toBe(true)
    expect(next?.sessionID).toBeUndefined()
    expect(next?.sessions).toEqual([])
    expect(useChatStore.getState().directories["/repo"]?.error).toBeUndefined()
  })

  test("does not create duplicate sessions when bootstrapping and creating concurrently", async () => {
    const sessionInfo = {
      id: "session-1",
      title: "New session",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {},
      directories: {},
    })

    let createRequests = 0
    let sessionWasCreated = false
    const createGate = createDeferred<void>()

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify(sessionWasCreated ? [sessionInfo] : []), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session") {
        createRequests += 1
        await createGate.promise
        sessionWasCreated = true
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/session-1/message") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/session-1") {
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/permission") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/provider") {
        return new Response(
          JSON.stringify({
            default: "",
            connected: [],
            all: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/provider/auth") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/config/mcp/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const ensurePromise = ensureDirectorySession("/repo")
    const startPromise = startNewSession("/repo")

    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    createGate.resolve()

    const [ensured, started] = await Promise.all([ensurePromise, startPromise])

    expect(createRequests).toBe(1)
    expect(ensured.directory).toBe("/repo")
    expect(ensured.info).toBeUndefined()
    expect(started.id).toBe("session-1")
  })

  test("does not reset to draft when a concurrent session is created during bootstrap", async () => {
    const sessionInfo = {
      id: "session-1",
      title: "New session",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {},
      directories: {},
    })

    let sessionListRequests = 0
    let sessionWasCreated = false
    const staleSessionListGate = createDeferred<void>()

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session") {
        sessionListRequests += 1
        if (sessionListRequests === 1) {
          await staleSessionListGate.promise
          return new Response(JSON.stringify([]), {
            headers: {
              "content-type": "application/json",
            },
          })
        }

        return new Response(JSON.stringify(sessionWasCreated ? [sessionInfo] : []), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session") {
        sessionWasCreated = true
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/session-1/message") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/permission") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/provider") {
        return new Response(
          JSON.stringify({
            default: "",
            connected: [],
            all: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/provider/auth") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/config/mcp/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const ensurePromise = ensureDirectorySession("/repo")
    const startPromise = startNewSession("/repo")

    const started = await startPromise
    staleSessionListGate.resolve()
    const ensured = await ensurePromise

    expect(started.id).toBe("session-1")
    expect(ensured.directory).toBe("/repo")
    expect(useChatStore.getState().directories["/repo"]?.sessionID).toBe("session-1")
    expect(useChatStore.getState().directories["/repo"]?.isDraft).toBe(false)
  })

  test("loads providers for an already-ready draft session", async () => {
    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {},
      directories: {
        "/repo": createDirectoryChatState({
          isDraft: true,
          isReady: true,
          providers: [],
          providerDefault: {},
        }),
      },
    })

    let providerRequests = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/provider") {
        providerRequests += 1
        return new Response(
          JSON.stringify({
            default: { openai: "gpt-5" },
            connected: ["openai"],
            all: [
              {
                id: "openai",
                name: "OpenAI",
                env: [],
                models: {
                  "gpt-5": {
                    id: "gpt-5",
                    name: "GPT-5",
                    family: "gpt-5",
                    limit: {
                      context: 1,
                      input: 1,
                      output: 1,
                    },
                    capabilities: {
                      reasoning: true,
                      attachment: true,
                      toolcall: true,
                      input: {
                        text: true,
                        audio: false,
                        image: true,
                        video: false,
                        pdf: true,
                      },
                      output: {
                        text: true,
                        audio: false,
                        image: false,
                        video: false,
                        pdf: false,
                      },
                      interleaved: false,
                    },
                  },
                },
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/provider/auth") {
        return new Response(JSON.stringify({ openai: [] }), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/permission") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/config/mcp/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const ensured = await ensureDirectorySession("/repo")
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(ensured).toEqual({
      directory: "/repo",
      info: undefined,
    })
    expect(providerRequests).toBe(1)
    expect(
      useChatStore.getState().directories["/repo"]?.providers.map((provider) => provider.id),
    ).toEqual(["openai"])
  })
})

describe("loadSessions", () => {
  test("scopes session listing to the requested directory", async () => {
    globalThis.fetch = createFetchStub(async (input, init) => {
      expect(String(input)).toBe("/api/session?directory=%2Frepo%2Ftauri")
      expect(init?.method).toBe("GET")
      expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo/tauri")
      return new Response(JSON.stringify([]), {
        headers: {
          "content-type": "application/json",
        },
      })
    })

    await loadSessions("/repo/tauri")
  })

  test("clears stale active session ids when the backend returns an empty session list", async () => {
    useChatStore.setState({
      activeDirectory: "/repo/tauri",
      lastSessionByDirectory: {
        "/repo/tauri": "session_stale",
      },
      directories: {
        "/repo/tauri": createDirectoryChatState({
          sessionID: "session_stale",
          isDraft: false,
          isReady: true,
        }),
      },
    })

    globalThis.fetch = createFetchStub(async () => {
      return new Response(JSON.stringify([]), {
        headers: {
          "content-type": "application/json",
        },
      })
    })

    await loadSessions("/repo/tauri")

    const directory = useChatStore.getState().directories["/repo/tauri"]
    expect(directory?.sessionID).toBeUndefined()
    expect(directory?.isDraft).toBe(true)
  })
})

describe("shouldDeferTranscriptReload", () => {
  test("defers transcript reload while the current session is streaming", () => {
    useChatStore.setState({
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "New chat",
          sessionStatusByID: { session_1: BUSY_SESSION_STATUS },
          isBusy: true,
          isReady: true,
          sessionID: "session_1",
        }),
      },
      streamStatus: "connected",
    })

    expect(shouldDeferTranscriptReload("/repo", "session_1")).toBe(true)
  })

  test("does not defer transcript reload when the stream is not active", () => {
    useChatStore.setState({
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "New chat",
          sessionStatusByID: { session_1: BUSY_SESSION_STATUS },
          isBusy: true,
          isReady: true,
          sessionID: "session_1",
        }),
      },
      streamStatus: "idle",
    })

    expect(shouldDeferTranscriptReload("/repo", "session_1")).toBe(true)
  })

  test("does not defer transcript reload when the current session is idle", () => {
    useChatStore.setState({
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "New chat",
          sessionStatusByID: { session_1: IDLE_SESSION_STATUS },
          isBusy: false,
          isReady: true,
          sessionID: "session_1",
        }),
      },
      streamStatus: "connected",
    })

    expect(shouldDeferTranscriptReload("/repo", "session_1")).toBe(false)
  })
})

describe("sendPrompt", () => {
  test("creates a session lazily when sending from draft mode", async () => {
    let createRequests = 0
    let promptRequests = 0

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": {
          isDraft: true,
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          pendingQuestions: [],
          providers: [],
          providerDefault: {},
          mcpStatus: {},
          isBusy: false,
          isReady: true,
        },
      },
    })

    const sessionInfo = {
      id: "session_1",
      title: "New thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session") {
        createRequests += 1
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        promptRequests += 1
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: "message_1",
              sessionID: sessionInfo.id,
              agent: "buddy",
              model: {
                providerID: "test",
                modelID: "test-model",
              },
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/session/session_1/message") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify([sessionInfo]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await sendPrompt("/repo", "hello")

    expect(createRequests).toBe(1)
    expect(promptRequests).toBe(1)
    expect(useChatStore.getState().directories["/repo"]?.sessionID).toBe("session_1")
    expect(useChatStore.getState().directories["/repo"]?.isDraft).toBe(false)
    const messages = useChatStore.getState().directories["/repo"]?.messages
    expect(messages?.map((message) => message.info)).toEqual([
      createUserMessageInfo({
        id: "message_1",
        sessionID: "session_1",
        agent: "buddy",
        model: {
          providerID: "test",
          modelID: "test-model",
        },
        time: {
          created: 2,
        },
      }),
    ])
    expect(messages?.[0]?.parts.map((part) => part.text)).toEqual(["hello"])
  })

  test("keeps the first submitted message when bootstrap transcript reload resolves stale after send", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "New thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          isDraft: true,
          isReady: false,
        }),
      },
    })

    const staleTranscriptGate = createDeferred<void>()
    let sessionListRequests = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session") {
        sessionListRequests += 1
        if (sessionListRequests === 1) {
          await staleTranscriptGate.promise
          return new Response(JSON.stringify([]), {
            headers: {
              "content-type": "application/json",
            },
          })
        }

        return new Response(JSON.stringify([sessionInfo]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/permission") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/provider") {
        return new Response(
          JSON.stringify({
            default: "",
            connected: [],
            all: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/provider/auth") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/config/mcp/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/status") {
        return new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session") {
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: "message_1",
              sessionID: sessionInfo.id,
              agent: "buddy",
              model: {
                providerID: "test",
                modelID: "test-model",
              },
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/session/session_1/message") {
        await staleTranscriptGate.promise
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const ensurePromise = ensureDirectorySession("/repo")
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await sendPrompt("/repo", "hello")

    const afterPrompt = useChatStore.getState().directories["/repo"]
    expect(afterPrompt?.sessionID).toBe("session_1")
    expect(afterPrompt?.isDraft).toBe(false)
    expect(afterPrompt?.isReady).toBe(true)
    expect(afterPrompt?.messages.map((message) => message.info.id)).toEqual(["message_1"])

    staleTranscriptGate.resolve()
    await ensurePromise

    const afterBootstrap = useChatStore.getState().directories["/repo"]
    expect(afterBootstrap?.sessionID).toBe("session_1")
    expect(afterBootstrap?.isDraft).toBe(false)
    expect(afterBootstrap?.messages.map((message) => message.info.id)).toEqual(["message_1"])
  })

  test("shows the submitted user message before the prompt request resolves", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "New thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          isDraft: true,
          isReady: true,
        }),
      },
    })

    const promptGate = createDeferred<void>()
    let promptMessageID = ""

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session") {
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        const body = JSON.parse(String(init?.body)) as { messageID: string }
        promptMessageID = body.messageID
        await promptGate.promise
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: body.messageID,
              sessionID: sessionInfo.id,
              agent: "buddy",
              model: {
                providerID: "test",
                modelID: "test-model",
              },
              time: {
                created: 2,
              },
            }),
            parts: [
              {
                id: "part_server",
                sessionID: sessionInfo.id,
                messageID: body.messageID,
                type: "text",
                text: "hello",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const sendPromise = sendPrompt("/repo", "hello", {
      model: {
        providerID: "test",
        modelID: "test-model",
      },
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    const pendingState = useChatStore.getState().directories["/repo"]
    expect(pendingState?.isReady).toBe(true)
    expect(pendingState?.sessionID).toBe("session_1")
    expect(pendingState?.messages.map((message) => message.info.id)).toEqual([promptMessageID])
    expect(pendingState?.messages[0]?.parts.map((part) => part.text)).toEqual(["hello"])

    promptGate.resolve()
    await sendPromise

    const acceptedState = useChatStore.getState().directories["/repo"]
    expect(acceptedState?.messages.map((message) => message.info.id)).toEqual([promptMessageID])
    expect(acceptedState?.messages[0]?.parts.map((part) => part.text)).toEqual(["hello"])
    expect(acceptedState?.messages[0]?.parts.map((part) => part.id)).toEqual(["part_server"])
  })

  test("keeps the optimistic user message when prompt response is an assistant message", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "New thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          isDraft: true,
          isReady: true,
        }),
      },
    })

    let promptMessageID = ""
    let assistantMessageID = ""

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session") {
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        const body = JSON.parse(String(init?.body)) as { messageID: string }
        promptMessageID = body.messageID
        assistantMessageID = `${body.messageID}z`
        return new Response(
          JSON.stringify({
            info: createAssistantMessageInfo({
              id: assistantMessageID,
              sessionID: sessionInfo.id,
              time: {
                created: 3,
                completed: 4,
              },
              finish: "stop",
            }),
            parts: [
              {
                id: "part_assistant",
                sessionID: sessionInfo.id,
                messageID: assistantMessageID,
                type: "text",
                text: "hello",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await sendPrompt("/repo", "hi", {
      model: {
        providerID: "test",
        modelID: "test-model",
      },
    })

    const state = useChatStore.getState().directories["/repo"]
    expect(state?.messages.map((message) => message.info.id)).toEqual([
      promptMessageID,
      assistantMessageID,
    ])
    expect(state?.messages[0]?.info.role).toBe("user")
    expect(state?.messages[0]?.parts.map((part) => part.text)).toEqual(["hi"])
    expect(state?.messages[1]?.info.role).toBe("assistant")
  })

  test("keeps consecutive prompt responses ordered within the same session", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "New thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          isDraft: true,
          isReady: true,
        }),
      },
    })

    let promptCount = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session") {
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        promptCount += 1
        const body = JSON.parse(String(init?.body)) as { messageID: string }
        const assistantMessageID = `${body.messageID}z`
        return new Response(
          JSON.stringify({
            info: createAssistantMessageInfo({
              id: assistantMessageID,
              sessionID: sessionInfo.id,
              parentID: body.messageID,
              time: {
                created: 10 + promptCount,
                completed: 20 + promptCount,
              },
              finish: "stop",
            }),
            parts: [
              {
                id: `part_assistant_${promptCount}`,
                sessionID: sessionInfo.id,
                messageID: assistantMessageID,
                type: "text",
                text: `reply ${promptCount}`,
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await sendPrompt("/repo", "hi", {
      model: {
        providerID: "test",
        modelID: "test-model",
      },
    })
    await sendPrompt("/repo", "what's up", {
      model: {
        providerID: "test",
        modelID: "test-model",
      },
    })

    const state = useChatStore.getState().directories["/repo"]
    expect(state?.messages.map((message) => message.info.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    expect(state?.messages.map((message) => message.parts[0]?.text)).toEqual([
      "hi",
      "reply 1",
      "what's up",
      "reply 2",
    ])
  })

  test("does not duplicate optimistic text when submitted parts already include text", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "New thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          isDraft: true,
          isReady: true,
        }),
      },
    })

    const promptGate = createDeferred<void>()
    let promptMessageID = ""

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session") {
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        const body = JSON.parse(String(init?.body)) as { messageID: string }
        promptMessageID = body.messageID
        await promptGate.promise
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: body.messageID,
              sessionID: sessionInfo.id,
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const sendPromise = sendPrompt("/repo", "hi", {
      parts: [
        {
          type: "text",
          text: "hi",
        },
      ],
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    const pendingState = useChatStore.getState().directories["/repo"]
    expect(pendingState?.messages.map((message) => message.info.id)).toEqual([promptMessageID])
    expect(pendingState?.messages[0]?.parts.map((part) => part.text)).toEqual(["hi"])

    promptGate.resolve()
    await sendPromise
  })

  test("shows the submitted user message without an explicit model before the prompt resolves", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "Existing thread",
      time: {
        created: 1,
        updated: 1,
      },
    }
    const previousMessage = createUserMessageInfo({
      id: "message_previous",
      sessionID: sessionInfo.id,
      agent: "buddy",
      model: {
        providerID: "test",
        modelID: "test-model",
      },
      time: {
        created: 1,
      },
    })

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          sessionID: sessionInfo.id,
          sessionTitle: sessionInfo.title,
          sessions: [sessionInfo],
          isDraft: false,
          isReady: true,
          messages: [createMessageWithParts(previousMessage)],
        }),
      },
    })

    const promptGate = createDeferred<void>()
    let promptMessageID = ""

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        const body = JSON.parse(String(init?.body)) as { messageID: string }
        promptMessageID = body.messageID
        await promptGate.promise
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: body.messageID,
              sessionID: sessionInfo.id,
              agent: "buddy",
              model: {
                providerID: "test",
                modelID: "test-model",
              },
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const sendPromise = sendPrompt("/repo", "second")
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    const pendingState = useChatStore.getState().directories["/repo"]
    expect(pendingState?.messages.map((message) => message.info.id)).toEqual([
      "message_previous",
      promptMessageID,
    ])
    expect(pendingState?.messages[1]?.parts.map((part) => part.text)).toEqual(["second"])

    promptGate.resolve()
    await sendPromise
  })

  test("does not switch back to the submitted session when a prompt resolves after session change", async () => {
    const submittedSession = {
      id: "session_1",
      title: "Submitted thread",
      time: {
        created: 1,
        updated: 1,
      },
    }
    const selectedSession = {
      id: "session_2",
      title: "Selected thread",
      time: {
        created: 2,
        updated: 2,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          sessionID: submittedSession.id,
          sessionTitle: submittedSession.title,
          sessions: [submittedSession, selectedSession],
          isDraft: false,
          isReady: true,
        }),
      },
    })

    const promptGate = createDeferred<void>()
    let promptMessageID = ""

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        const body = JSON.parse(String(init?.body)) as { messageID: string }
        promptMessageID = body.messageID
        await promptGate.promise
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: body.messageID,
              sessionID: submittedSession.id,
              agent: "buddy",
              model: {
                providerID: "test",
                modelID: "test-model",
              },
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const sendPromise = sendPrompt("/repo", "hello", {
      model: {
        providerID: "test",
        modelID: "test-model",
      },
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    useChatStore.getState().setActiveSession("/repo", selectedSession.id)
    promptGate.resolve()
    await sendPromise

    const state = useChatStore.getState().directories["/repo"]
    expect(state?.sessionID).toBe(selectedSession.id)
    expect(state?.sessionTitle).toBe(selectedSession.title)
    expect(state?.messages).toEqual([])
    expect(
      state?.messagesBySessionID?.[submittedSession.id]?.map((message) => message.info.id),
    ).toEqual([promptMessageID])
    expect(
      state?.messagesBySessionID?.[submittedSession.id]?.[0]?.parts.map((part) => part.text),
    ).toEqual(["hello"])
  })

  test("migrates draft model state only into newly created sessions", async () => {
    let createRequests = 0

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": {
          isDraft: true,
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          pendingQuestions: [],
          providers: [],
          providerDefault: {},
          mcpStatus: {},
          isBusy: false,
          isReady: true,
        },
      },
    })

    const workspaceKey = getModelSelectionScopeKey("/repo")
    const sessionKey = getModelSelectionScopeKey("/repo", "session_1")
    useModelSelectionStore.setState({
      selectedAgentByKey: {
        [workspaceKey]: "build",
      },
      selectedModelByKey: {
        [workspaceKey]: "openai/gpt-5",
      },
      selectedVariantByKey: {
        [workspaceKey]: null,
      },
      recentModelKeys: [],
    })

    const sessionInfo = {
      id: "session_1",
      title: "New thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session") {
        createRequests += 1
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_1/message") {
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: "message_1",
              sessionID: sessionInfo.id,
              agent: "build",
              model: {
                providerID: "openai",
                modelID: "gpt-5",
              },
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/session/session_1/message") {
        return new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify([sessionInfo]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await sendPrompt("/repo", "hello")

    expect(createRequests).toBe(1)
    expect(useModelSelectionStore.getState().selectedAgentByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedModelByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedVariantByKey[workspaceKey]).toBeUndefined()
    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("build")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe("openai/gpt-5")
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBeNull()
  })

  test("does not copy draft model state into an existing session selection", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "Earlier thread",
      time: {
        created: 1,
        updated: 1,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": {
          isDraft: true,
          sessionTitle: "New chat",
          sessions: [sessionInfo],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          pendingQuestions: [],
          providers: [],
          providerDefault: {},
          mcpStatus: {},
          isBusy: false,
          isReady: true,
        },
      },
    })

    const workspaceKey = getModelSelectionScopeKey("/repo")
    const sessionKey = getModelSelectionScopeKey("/repo", "session_1")
    useModelSelectionStore.setState({
      selectedAgentByKey: {
        [workspaceKey]: "build",
      },
      selectedModelByKey: {
        [workspaceKey]: "openai/gpt-5",
      },
      selectedVariantByKey: {
        [workspaceKey]: null,
      },
      recentModelKeys: [],
    })

    const transcript = [
      createMessageWithParts(
        createUserMessageInfo({
          id: "message-1",
          sessionID: sessionInfo.id,
          agent: "plan",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
            variant: "low",
          },
        }),
      ),
    ]

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session/session_1/message") {
        return new Response(JSON.stringify(transcript), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await selectSession("/repo", sessionInfo.id)

    expect(useModelSelectionStore.getState().selectedAgentByKey[workspaceKey]).toBe("build")
    expect(useModelSelectionStore.getState().selectedModelByKey[workspaceKey]).toBe("openai/gpt-5")
    expect(useModelSelectionStore.getState().selectedVariantByKey[workspaceKey]).toBeNull()
    expect(useModelSelectionStore.getState().selectedAgentByKey[sessionKey]).toBe("plan")
    expect(useModelSelectionStore.getState().selectedModelByKey[sessionKey]).toBe(
      "anthropic/claude-sonnet-4",
    )
    expect(useModelSelectionStore.getState().selectedVariantByKey[sessionKey]).toBe("low")
  })

  test("stores a directory error when lazy session creation fails", async () => {
    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": {
          isDraft: true,
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          pendingQuestions: [],
          providers: [],
          providerDefault: {},
          mcpStatus: {},
          isBusy: false,
          isReady: true,
        },
      },
    })

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session") {
        return new Response(JSON.stringify({ error: "session create failed" }), {
          status: 500,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await expect(sendPrompt("/repo", "hello")).rejects.toThrow("session create failed")
    expect(useChatStore.getState().directories["/repo"]?.error).toContain("session create failed")
    expect(useChatStore.getState().directories["/repo"]?.sessionID).toBeUndefined()
  })

  test("recovers from stale session ids by creating a new session and retrying once", async () => {
    let createRequests = 0
    let stalePromptRequests = 0
    let recoveredPromptRequests = 0

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "Existing chat",
          isBusy: false,
          isReady: true,
          isDraft: false,
          sessionID: "session_stale",
        }),
      },
    })

    const recoveredSession = {
      id: "session_new",
      title: "Recovered session",
      time: {
        created: 1,
        updated: 1,
      },
    }

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session/session_stale/message") {
        stalePromptRequests += 1
        return new Response(JSON.stringify({ error: "Session not found: session_stale" }), {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session") {
        createRequests += 1
        return new Response(JSON.stringify(recoveredSession), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_new/message") {
        recoveredPromptRequests += 1
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: "message_new",
              sessionID: recoveredSession.id,
              agent: "buddy",
              model: {
                providerID: "test",
                modelID: "test-model",
              },
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify([recoveredSession]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await sendPrompt("/repo", "hello")

    expect(stalePromptRequests).toBe(1)
    expect(createRequests).toBe(1)
    expect(recoveredPromptRequests).toBe(1)
    expect(useChatStore.getState().directories["/repo"]?.sessionID).toBe("session_new")
    expect(useChatStore.getState().directories["/repo"]?.isDraft).toBe(false)
  })

  test("recovers when prompt 404s even if the backend does not return a session-not-found message", async () => {
    let stalePromptRequests = 0
    let staleLookupRequests = 0
    let createRequests = 0
    let recoveredPromptRequests = 0

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "Existing chat",
          isBusy: false,
          isReady: true,
          isDraft: false,
          sessionID: "session_stale",
        }),
      },
    })

    const recoveredSession = {
      id: "session_new",
      title: "Recovered session",
      time: {
        created: 1,
        updated: 1,
      },
    }

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === "/api/session/session_stale/message") {
        stalePromptRequests += 1
        return new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/session_stale") {
        staleLookupRequests += 1
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session") {
        createRequests += 1
        return new Response(JSON.stringify(recoveredSession), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "POST" && url.pathname === "/api/session/session_new/message") {
        recoveredPromptRequests += 1
        return new Response(
          JSON.stringify({
            info: createUserMessageInfo({
              id: "message_new",
              sessionID: recoveredSession.id,
              agent: "buddy",
              model: {
                providerID: "test",
                modelID: "test-model",
              },
              time: {
                created: 2,
              },
            }),
            parts: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify([recoveredSession]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await sendPrompt("/repo", "hello")

    expect(stalePromptRequests).toBe(1)
    expect(staleLookupRequests).toBe(1)
    expect(createRequests).toBe(1)
    expect(recoveredPromptRequests).toBe(1)
    expect(useChatStore.getState().directories["/repo"]?.sessionID).toBe("session_new")
  })

  test("does not start a transcript polling loop after prompt submission", async () => {
    let requests = 0

    useChatStore.setState({
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "New chat",
          isBusy: false,
          isReady: true,
          sessionID: "session_1",
        }),
      },
    })

    globalThis.fetch = createFetchStub(async () => {
      requests += 1
      return new Response(
        JSON.stringify({
          info: createUserMessageInfo({
            id: "message_1",
            sessionID: "session_1",
            agent: "buddy",
            model: {
              providerID: "test",
              modelID: "test-model",
            },
            time: {
              created: 2,
            },
          }),
          parts: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    await sendPrompt("/repo", "hello")
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 350)
    })

    expect(requests).toBe(1)
  })

  test("sends explicit focus-goal targeting when provided", async () => {
    useChatStore.setState({
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "New chat",
          isBusy: false,
          isReady: true,
          sessionID: "session_1",
        }),
      },
    })

    globalThis.fetch = createFetchStub(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        content: "give me a practice task",
        focusGoalIds: ["goal_1"],
      })
      return new Response(
        JSON.stringify({
          info: createUserMessageInfo({
            id: "message_1",
            sessionID: "session_1",
            agent: "buddy",
            model: {
              providerID: "test",
              modelID: "test-model",
            },
            time: {
              created: 2,
            },
          }),
          parts: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    await sendPrompt("/repo", "give me a practice task", {
      focusGoalIds: ["goal_1"],
    })
  })

  test("forwards workspace file references alongside attachment parts", async () => {
    useChatStore.setState({
      directories: {
        "/repo": createDirectoryChatState({
          sessionTitle: "New chat",
          isBusy: false,
          isReady: true,
          sessionID: "session_1",
        }),
      },
    })

    globalThis.fetch = createFetchStub(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        content: "Read @docs/book with spaces.pdf",
        parts: [
          {
            type: "workspace-file-reference",
            path: "docs/book with spaces.pdf",
          },
        ],
      })
      return new Response(
        JSON.stringify({
          info: createUserMessageInfo({
            id: "message_1",
            sessionID: "session_1",
            agent: "buddy",
            model: {
              providerID: "test",
              modelID: "test-model",
            },
            time: {
              created: 2,
            },
          }),
          parts: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    await sendPrompt("/repo", "Read @docs/book with spaces.pdf", {
      parts: [{ type: "workspace-file-reference", path: "docs/book with spaces.pdf" }],
    })
  })
})

describe("loadMessages", () => {
  test("retries a transient missing-session transcript reload when the session still exists", async () => {
    const sessionInfo = {
      id: "session-1",
      title: "Greeting",
      time: {
        created: 1,
        updated: 2,
      },
    }
    const transcript = [
      createMessageWithParts(createUserMessageInfo({ id: "message-1", sessionID: sessionInfo.id })),
    ]

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {
        "/repo": sessionInfo.id,
      },
      directories: {
        "/repo": createDirectoryChatState({
          sessionID: sessionInfo.id,
          sessionTitle: sessionInfo.title,
          sessions: [sessionInfo],
          isDraft: false,
          isReady: true,
        }),
      },
    })

    let messageRequests = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session/session-1/message") {
        messageRequests += 1
        if (messageRequests === 1) {
          return new Response(JSON.stringify({ error: "Session not found" }), {
            status: 404,
            headers: {
              "content-type": "application/json",
            },
          })
        }

        return new Response(JSON.stringify(transcript), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/session-1") {
        return new Response(JSON.stringify(sessionInfo), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await expect(loadMessages("/repo", sessionInfo.id)).resolves.toEqual(transcript)

    expect(messageRequests).toBe(2)
    expect(useChatStore.getState().directories["/repo"]?.messages).toEqual(transcript)
    expect(useChatStore.getState().directories["/repo"]?.error).toBeUndefined()
  })

  test("ignores stale transcript errors once a newer reload has already succeeded", async () => {
    const sessionInfo = {
      id: "session-1",
      title: "Greeting",
      time: {
        created: 1,
        updated: 2,
      },
    }
    const transcript = [
      createMessageWithParts(createUserMessageInfo({ id: "message-1", sessionID: sessionInfo.id })),
    ]
    const firstResponseGate = createDeferred<void>()

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      lastSessionByDirectory: {
        "/repo": sessionInfo.id,
      },
      directories: {
        "/repo": createDirectoryChatState({
          sessionID: sessionInfo.id,
          sessionTitle: sessionInfo.title,
          sessions: [sessionInfo],
          isDraft: false,
          isReady: true,
        }),
      },
    })

    let messageRequests = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "GET" && url.pathname === "/api/session/session-1/message") {
        messageRequests += 1
        if (messageRequests === 1) {
          await firstResponseGate.promise
          return new Response(JSON.stringify({ error: "Session not found" }), {
            status: 404,
            headers: {
              "content-type": "application/json",
            },
          })
        }

        return new Response(JSON.stringify(transcript), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    const staleLoad = loadMessages("/repo", sessionInfo.id).catch((error) => error)
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0)
    })

    await expect(loadMessages("/repo", sessionInfo.id)).resolves.toEqual(transcript)

    firstResponseGate.resolve()
    const staleError = await staleLoad
    expect(staleError).toBeInstanceOf(Error)
    expect(useChatStore.getState().directories["/repo"]?.messages).toEqual(transcript)
    expect(useChatStore.getState().directories["/repo"]?.error).toBeUndefined()
  })
})

describe("abortPrompt", () => {
  test("recovers a stale busy session when abort fails but the backend is already idle", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "Greeting",
      time: {
        created: 1,
        updated: 2,
      },
    }
    const transcript = [
      createMessageWithParts(
        createAssistantMessageInfo({
          id: "message_1",
          sessionID: sessionInfo.id,
          time: { created: 1 },
        }),
      ),
    ]

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      streamStatus: "connected",
      lastSessionByDirectory: {
        "/repo": sessionInfo.id,
      },
      directories: {
        "/repo": createDirectoryChatState({
          sessionID: sessionInfo.id,
          sessionTitle: sessionInfo.title,
          sessions: [sessionInfo],
          messages: transcript,
          isBusy: true,
          isDraft: false,
          isReady: true,
          sessionStatusByID: {
            [sessionInfo.id]: BUSY_SESSION_STATUS,
          },
        }),
      },
    })

    let abortRequests = 0
    let statusRequests = 0

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === `/api/session/${sessionInfo.id}/abort`) {
        abortRequests += 1
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session") {
        return new Response(JSON.stringify([sessionInfo]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/status") {
        statusRequests += 1
        return new Response(
          JSON.stringify({
            [sessionInfo.id]: IDLE_SESSION_STATUS,
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (method === "GET" && url.pathname === `/api/session/${sessionInfo.id}/message`) {
        return new Response(JSON.stringify(transcript), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await expect(abortPrompt("/repo")).resolves.toBe(false)

    const next = useChatStore.getState().directories["/repo"]
    expect(abortRequests).toBe(1)
    expect(statusRequests).toBeGreaterThanOrEqual(2)
    expect(next?.isBusy).toBe(false)
    expect(next?.sessionStatusByID[sessionInfo.id]).toEqual(IDLE_SESSION_STATUS)
    expect(next?.messages[0]?.info.time.completed).toEqual(expect.any(Number))
    expect(next?.error).toBeUndefined()
  })

  test("does not suppress abort failures just because the user switched sessions", async () => {
    const sessionInfo = {
      id: "session_1",
      title: "Greeting",
      time: {
        created: 1,
        updated: 2,
      },
    }
    const otherSessionInfo = {
      id: "session_2",
      title: "Follow-up",
      time: {
        created: 3,
        updated: 4,
      },
    }

    useChatStore.setState({
      openProjects: ["/repo"],
      activeDirectory: "/repo",
      streamStatus: "connected",
      lastSessionByDirectory: {
        "/repo": sessionInfo.id,
      },
      directories: {
        "/repo": createDirectoryChatState({
          sessionID: sessionInfo.id,
          sessionTitle: sessionInfo.title,
          sessions: [sessionInfo, otherSessionInfo],
          isBusy: true,
          isDraft: false,
          isReady: true,
          sessionStatusByID: {
            [sessionInfo.id]: BUSY_SESSION_STATUS,
            [otherSessionInfo.id]: IDLE_SESSION_STATUS,
          },
        }),
      },
    })

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = new URL(requestUrl(input), "http://localhost")
      const method = requestMethod(input, init) ?? "GET"

      if (method === "POST" && url.pathname === `/api/session/${sessionInfo.id}/abort`) {
        return new Response(JSON.stringify({ error: "Abort refused" }), {
          status: 500,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session") {
        useChatStore.getState().setActiveSession("/repo", otherSessionInfo.id)
        return new Response(JSON.stringify([sessionInfo, otherSessionInfo]), {
          headers: {
            "content-type": "application/json",
          },
        })
      }

      if (method === "GET" && url.pathname === "/api/session/status") {
        return new Response(
          JSON.stringify({
            [sessionInfo.id]: BUSY_SESSION_STATUS,
            [otherSessionInfo.id]: IDLE_SESSION_STATUS,
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}${url.search}`)
    })

    await expect(abortPrompt("/repo")).rejects.toThrow()

    const next = useChatStore.getState().directories["/repo"]
    expect(next?.sessionID).toBe(otherSessionInfo.id)
    expect(next?.sessionStatusByID[sessionInfo.id]).toEqual(BUSY_SESSION_STATUS)
    expect(next?.error).toBeDefined()
  })
})

describe("loadCurriculumView", () => {
  test("forwards the current session id when loading the learner snapshot", async () => {
    globalThis.fetch = createFetchStub(async (input, init) => {
      expect(String(input)).toBe("/api/learner/snapshot?persona=code-buddy&sessionId=session_1")
      expect(init?.method).toBe("GET")
      expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
      const payload = {
        workspace: {
          workspaceId: "w_1",
          label: "Workspace",
          tags: [],
          pinnedGoalIds: [],
          projectConstraints: [],
          localToolAvailability: [],
          preferredSurfaces: [],
          opportunities: [],
          userOverride: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        goals: [],
        openFeedback: [],
        constraintsSummary: [],
        sections: [],
        markdown: "",
      }
      return new Response(JSON.stringify(payload), {
        headers: {
          "content-type": "application/json",
        },
      })
    })

    const view = await loadCurriculumView("/repo", {
      persona: "code-buddy",
      sessionID: "session_1",
    })

    expect(view.workspace.workspaceId).toBe("w_1")
    expect(view.coldStart).toBe(true)
    expect(view.openFeedbackActions).toEqual([])
  })

  test("returns the current snapshot without any generated next-step fields", async () => {
    globalThis.fetch = createFetchStub(async (_input, init) => {
      expect(init?.method).toBe("GET")
      const payload = {
        workspace: {
          workspaceId: "w_1",
          label: "Workspace",
          tags: [],
          pinnedGoalIds: [],
          projectConstraints: [],
          localToolAvailability: [],
          preferredSurfaces: [],
          opportunities: [],
          userOverride: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        goals: [{ id: "goal_1" }],
        openFeedback: [],
        constraintsSummary: [],
        sections: [],
        markdown: "",
      }
      return new Response(JSON.stringify(payload), {
        headers: {
          "content-type": "application/json",
        },
      })
    })

    const view = await loadCurriculumView("/repo")

    expect(view.coldStart).toBe(false)
    expect(Object.keys(view).toSorted()).toEqual([
      "actions",
      "actionsUnavailable",
      "alignmentSummary",
      "alignmentSummaryUnavailable",
      "coldStart",
      "constraintsSummary",
      "markdown",
      "openFeedbackActions",
      "sections",
      "workspace",
    ])
  })
})

describe("loadRuntimeCapabilities", () => {
  test("returns allowed and denied tool/skill state", async () => {
    globalThis.fetch = createFetchStub(async (input) => {
      expect(String(input)).toBe("/api/learner/snapshot?persona=code-buddy&sessionId=session_1")
      const payload = {
        runtimeContext: {
          workspaceState: "interactive",
        },
        runtimeProfile: {
          persona: "code-buddy",
          capabilityEnvelope: {
            visibleSurfaces: ["editor", "curriculum"],
            defaultSurface: "editor",
            tools: {
              learner_snapshot_read: "allow",
              pedagogy_guided_practice: "allow",
              pedagogy_reflection: "deny",
            },
            skills: {
              "buddy-pedagogy-explanation": "deny",
              "buddy-pedagogy-worked-example": "deny",
            },
            subagents: {
              "practice-agent": "allow",
              "assessment-agent": "deny",
              "curriculum-orchestrator": "prefer",
            },
          },
        },
      }
      return new Response(JSON.stringify(payload), {
        headers: {
          "content-type": "application/json",
        },
      })
    })

    const capabilities = await loadRuntimeCapabilities("/repo", {
      persona: "code-buddy",
      sessionID: "session_1",
    })

    expect(capabilities.persona).toBe("code-buddy")
    expect(capabilities.workspaceState).toBe("interactive")
    expect(capabilities.visibleSurfaces).toEqual(["curriculum", "editor"])
    expect(capabilities.tools.allow).toEqual(["learner_snapshot_read", "pedagogy_guided_practice"])
    expect(capabilities.tools.deny).toEqual(["pedagogy_reflection"])
    expect(capabilities.skills.allow).toEqual([])
    expect(capabilities.skills.deny).toEqual([
      "buddy-pedagogy-explanation",
      "buddy-pedagogy-worked-example",
    ])
    expect(capabilities.subagents.prefer).toEqual(["curriculum-orchestrator"])
    expect(capabilities.subagents.allow).toEqual(["practice-agent"])
    expect(capabilities.subagents.deny).toEqual(["assessment-agent"])
  })
})

describe("resolveDefaultPersonaID", () => {
  test("uses the catalog order when no default is configured", () => {
    const selected = resolveDefaultPersonaID([
      {
        id: "code-buddy",
        label: "A Code",
        surfaces: ["curriculum", "editor"],
        defaultSurface: "editor",
      },
      {
        id: "buddy",
        label: "Z Buddy",
        surfaces: ["curriculum"],
        defaultSurface: "curriculum",
      },
    ])

    expect(selected).toBe("code-buddy")
  })

  test("returns the first visible persona from the catalog", () => {
    const selected = resolveDefaultPersonaID([
      {
        id: "reading-buddy",
        label: "A Reading",
        surfaces: ["curriculum", "question-set"],
        defaultSurface: "curriculum",
      },
      {
        id: "math-buddy",
        label: "Z Math",
        surfaces: ["curriculum", "figure"],
        defaultSurface: "figure",
      },
    ])

    expect(selected).toBe("reading-buddy")
  })
})
