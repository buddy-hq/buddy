import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  loadCurriculumView,
  loadOpenProjects,
  openProject,
  resolveDefaultPersonaID,
  sendPrompt,
  shouldDeferTranscriptReload,
} from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"

const originalFetch = globalThis.fetch

function resetStore() {
  useChatStore.setState({
    openProjects: [],
    activeDirectory: undefined,
    entryError: undefined,
    lastSessionByDirectory: {},
    selectedModelByDirectory: {},
    directories: {},
    streamStatus: "idle",
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("loadOpenProjects", () => {
  test("restores normalized open projects from local state", async () => {
    globalThis.fetch = (async () => {
      throw new Error("loadOpenProjects should not fetch")
    }) as typeof fetch

    useChatStore.setState({
      openProjects: ["/repo/root", "/repo/root/", " /repo/other/ ", "/"],
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
    globalThis.fetch = (async (_input, init) => {
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
    }) as typeof fetch

    const nextDirectory = await openProject("/repo/nested/")

    expect(nextDirectory).toBe("/repo")
    expect(useChatStore.getState().openProjects).toEqual(["/repo"])
  })

  test("allows non-git folders", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          directory: "/tmp",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )) as typeof fetch

    const nextDirectory = await openProject("/tmp")

    expect(nextDirectory).toBe("/tmp")
    expect(useChatStore.getState().openProjects).toEqual(["/tmp"])
  })

  test("surfaces backend validation failures without opening the project", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Directory is outside allowed roots" }), {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      })) as typeof fetch

    await expect(openProject("../repo")).rejects.toThrow("Directory is outside allowed roots")
    expect(useChatStore.getState().openProjects).toEqual([])
  })

  test("rejects the filesystem root", async () => {
    await expect(openProject("/")).rejects.toThrow("Please choose a notebook directory, not /")
    expect(useChatStore.getState().openProjects).toEqual([])
  })
})

describe("shouldDeferTranscriptReload", () => {
  test("defers transcript reload while the current session is streaming", () => {
    useChatStore.setState({
      directories: {
        "/repo": {
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: { session_1: "busy" },
          messages: [],
          pendingPermissions: [],
          providers: [],
          providerDefault: {},
          isBusy: true,
          isReady: true,
          sessionID: "session_1",
        },
      },
      streamStatus: "connected",
    })

    expect(shouldDeferTranscriptReload("/repo", "session_1")).toBe(true)
  })

  test("does not defer transcript reload when the stream is not active", () => {
    useChatStore.setState({
      directories: {
        "/repo": {
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: { session_1: "busy" },
          messages: [],
          pendingPermissions: [],
          providers: [],
          providerDefault: {},
          isBusy: true,
          isReady: true,
          sessionID: "session_1",
        },
      },
      streamStatus: "idle",
    })

    expect(shouldDeferTranscriptReload("/repo", "session_1")).toBe(false)
  })
})

describe("sendPrompt", () => {
  test("does not start a transcript polling loop after prompt submission", async () => {
    let requests = 0

    useChatStore.setState({
      directories: {
        "/repo": {
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          providers: [],
          providerDefault: {},
          isBusy: false,
          isReady: true,
          sessionID: "session_1",
        },
      },
    })

    globalThis.fetch = (async () => {
      requests += 1
      return new Response(JSON.stringify({}), {
        headers: {
          "content-type": "application/json",
        },
      })
    }) as typeof fetch

    await sendPrompt("/repo", "hello")
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 350)
    })

    expect(requests).toBe(1)
  })

  test("sends an explicit activity bundle override when provided", async () => {
    useChatStore.setState({
      directories: {
        "/repo": {
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          providers: [],
          providerDefault: {},
          isBusy: false,
          isReady: true,
          sessionID: "session_1",
        },
      },
    })

    globalThis.fetch = (async (_input, init) => {
      expect(init?.body).toBe(
        JSON.stringify({
          content: "give me a practice task",
          intent: "practice",
          activityBundleId: "practice-guided",
          focusGoalIds: ["goal_1"],
        }),
      )
      return new Response(JSON.stringify({}), {
        headers: {
          "content-type": "application/json",
        },
      })
    }) as typeof fetch

    await sendPrompt("/repo", "give me a practice task", {
      intent: "practice",
      activityBundleId: "practice-guided",
      focusGoalIds: ["goal_1"],
    })
  })
})

describe("loadCurriculumView", () => {
  test("forwards the current session id when loading the learner plan", async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe("/api/learner/curriculum-view?persona=code-buddy&intent=practice&sessionId=session_1")
      expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
      return new Response(JSON.stringify({}), {
        headers: {
          "content-type": "application/json",
        },
      })
    }) as typeof fetch

    await loadCurriculumView("/repo", {
      persona: "code-buddy",
      intent: "practice",
      sessionID: "session_1",
    })
  })
})

describe("resolveDefaultPersonaID", () => {
  test("uses the built-in persona order instead of label order when no default is configured", () => {
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

    expect(selected).toBe("buddy")
  })
})
