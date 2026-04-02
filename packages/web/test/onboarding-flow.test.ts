import { beforeEach, describe, expect, test } from "bun:test"
import {
  configureNotebookForOnboarding,
  connectChatGptPlusForOnboarding,
} from "../src/lib/onboarding-flow"
import {
  resolveDesktopEntryPath,
  resolveDesktopOnboardingAutoContinueDirectory,
  resolveDesktopEntryPathWithSnapshots,
} from "../src/lib/desktop-onboarding"
import {
  buildOnboardingChatEntryReturnTo,
  buildOnboardingTestSearch,
} from "../src/lib/onboarding-test-mode"
import type {
  ProviderCatalogState,
  ProviderInfo,
  ProviderMethodInfo,
  ProviderModelInfo,
} from "../src/state/chat-types"
import { useOnboardingStore } from "../src/state/onboarding-store"

function createModel(id: string, name: string): ProviderModelInfo {
  return {
    id,
    providerID: "",
    name,
    variants: [],
    status: "active",
    limit: {
      context: 200_000,
      output: 16_384,
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
  }
}

function createProvider(input: {
  id: string
  name: string
  connected?: boolean
  methods?: ProviderMethodInfo[]
  models?: ProviderModelInfo[]
}): ProviderInfo {
  return {
    id: input.id,
    name: input.name,
    source: "config",
    env: [],
    connected: input.connected ?? false,
    methods: input.methods ?? [],
    models: (input.models ?? []).map((model) => Object.assign({}, model, { providerID: input.id })),
  }
}

function createCatalog(input: {
  providers: ProviderInfo[]
  default?: Record<string, string>
}): ProviderCatalogState {
  return {
    providers: input.providers,
    default: input.default ?? {},
  }
}

beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.clear()
  }
  useOnboardingStore.getState().reset()
})

describe("desktop onboarding entry routing", () => {
  test("redirects a first desktop launch to onboarding", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        completed: false,
        openProjects: [],
        activeDirectory: undefined,
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/onboarding")
  })

  test("skips onboarding after completion or existing chat context", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        completed: true,
        openProjects: [],
        activeDirectory: undefined,
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/chat")

    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        completed: false,
        openProjects: ["/repo"],
        activeDirectory: "/repo",
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/chat")
  })

  test("skips onboarding when open projects already exist in the backend registry", async () => {
    let markedCompleted = false

    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          completed: false,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return ["/repo"]
        },
        async loadProviderCatalogSnapshot() {
          return createCatalog({
            providers: [],
          })
        },
        markOnboardingCompleted() {
          markedCompleted = true
        },
      }),
    ).resolves.toBe("/chat")

    expect(markedCompleted).toBe(false)
  })

  test("skips onboarding when OpenAI is already connected", async () => {
    let markedCompleted = false

    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          completed: false,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return []
        },
        async loadProviderCatalogSnapshot() {
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
                methods: [{ type: "oauth", label: "ChatGPT Pro/Plus (browser)" }],
              }),
            ],
          })
        },
        markOnboardingCompleted() {
          markedCompleted = true
        },
      }),
    ).resolves.toBe("/chat")

    expect(markedCompleted).toBe(true)
  })

  test("keeps onboarding when provider catalog cannot be read", async () => {
    let markedCompleted = false

    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          completed: false,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return []
        },
        async loadProviderCatalogSnapshot() {
          throw new Error("network down")
        },
        markOnboardingCompleted() {
          markedCompleted = true
        },
      }),
    ).resolves.toBe("/onboarding")

    expect(markedCompleted).toBe(false)
  })

  test("auto-continues onboarding to the active open project when OpenAI is connected", () => {
    expect(
      resolveDesktopOnboardingAutoContinueDirectory({
        connectedOpenAiProvider: true,
        openProjects: ["/repo-a", "/repo-b"],
        activeDirectory: "/repo-b",
      }),
    ).toBe("/repo-b")

    expect(
      resolveDesktopOnboardingAutoContinueDirectory({
        connectedOpenAiProvider: true,
        openProjects: ["/repo-a", "/repo-b"],
        activeDirectory: undefined,
      }),
    ).toBe("/repo-a")

    expect(
      resolveDesktopOnboardingAutoContinueDirectory({
        connectedOpenAiProvider: false,
        openProjects: ["/repo-a"],
        activeDirectory: "/repo-a",
      }),
    ).toBeUndefined()
  })
})

describe("onboarding test mode", () => {
  test("builds the dev-only query used to open onboarding from chat", () => {
    expect(buildOnboardingTestSearch(buildOnboardingChatEntryReturnTo())).toEqual({
      test: "onboarding",
      returnTo: buildOnboardingChatEntryReturnTo(),
    })
  })
})

describe("onboarding store", () => {
  test("clears transient onboarding state when setup completes", () => {
    const store = useOnboardingStore.getState()
    store.setPhase("folder")
    store.setAuthChoice("free_models")
    store.setResumeDirectory("/repo")

    store.markCompleted()

    expect(useOnboardingStore.getState()).toMatchObject({
      completed: true,
      phase: "splash",
      authChoice: undefined,
      resumeDirectory: undefined,
    })
  })
})

describe("ChatGPT Plus onboarding auth", () => {
  test("launches the browser auth flow and verifies the OpenAI connection", async () => {
    const calls: string[] = []
    let openedUrl = ""

    const catalogBefore = createCatalog({
      providers: [
        createProvider({
          id: "openai",
          name: "OpenAI",
          connected: false,
          methods: [
            { type: "oauth", label: "ChatGPT Pro/Plus (browser)" },
            { type: "oauth", label: "ChatGPT Pro/Plus (headless)" },
          ],
          models: [createModel("gpt-5", "GPT-5")],
        }),
      ],
    })
    const catalogAfter = createCatalog({
      providers: [
        createProvider({
          id: "openai",
          name: "OpenAI",
          connected: true,
          methods: [{ type: "oauth", label: "ChatGPT Pro/Plus (browser)" }],
          models: [createModel("gpt-5", "GPT-5")],
        }),
      ],
      default: {
        openai: "gpt-5",
      },
    })
    let catalogCalls = 0

    await expect(
      connectChatGptPlusForOnboarding({
        openLink(url) {
          openedUrl = url
          calls.push("openLink")
        },
        async loadProviderCatalogSnapshot() {
          calls.push("loadCatalog")
          catalogCalls += 1
          return catalogCalls === 1 ? catalogBefore : catalogAfter
        },
        async authorizeProviderOAuth(request) {
          expect(request).toEqual({
            providerID: "openai",
            methodIndex: 0,
          })
          calls.push("authorize")
          return {
            url: "https://chatgpt.example/auth",
            method: "auto",
            instructions: "Complete authorization in your browser.",
          }
        },
        async completeProviderOAuth(request) {
          expect(request).toEqual({
            providerID: "openai",
            methodIndex: 0,
          })
          calls.push("complete")
        },
        async reloadProviderRuntime() {
          calls.push("reload")
        },
      }),
    ).resolves.toBeUndefined()

    expect(openedUrl).toBe("https://chatgpt.example/auth")
    expect(calls).toEqual([
      "loadCatalog",
      "authorize",
      "openLink",
      "complete",
      "reload",
      "loadCatalog",
    ])
  })

  test("fails when the auth flow is cancelled or does not complete automatically", async () => {
    const catalog = createCatalog({
      providers: [
        createProvider({
          id: "openai",
          name: "OpenAI",
          connected: false,
          methods: [{ type: "oauth", label: "ChatGPT Pro/Plus (browser)" }],
        }),
      ],
    })

    await expect(
      connectChatGptPlusForOnboarding({
        openLink() {},
        async loadProviderCatalogSnapshot() {
          return catalog
        },
        async authorizeProviderOAuth() {
          throw new Error("Authorization cancelled")
        },
        async completeProviderOAuth() {},
        async reloadProviderRuntime() {},
      }),
    ).rejects.toThrow("Authorization cancelled")
  })

  test("reuses the existing OpenAI connection without restarting OAuth", async () => {
    let authorizeCalled = false
    let openLinkCalled = false
    let completeCalled = false
    let reloadCalled = false

    await expect(
      connectChatGptPlusForOnboarding({
        openLink() {
          openLinkCalled = true
        },
        async loadProviderCatalogSnapshot() {
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
                models: [createModel("gpt-5", "GPT-5")],
              }),
            ],
            default: {
              openai: "gpt-5",
            },
          })
        },
        async authorizeProviderOAuth() {
          authorizeCalled = true
          return undefined
        },
        async completeProviderOAuth() {
          completeCalled = true
        },
        async reloadProviderRuntime() {
          reloadCalled = true
        },
      }),
    ).resolves.toBeUndefined()

    expect(authorizeCalled).toBe(false)
    expect(openLinkCalled).toBe(false)
    expect(completeCalled).toBe(false)
    expect(reloadCalled).toBe(false)
  })
})

describe("notebook onboarding configuration", () => {
  test("applies the connected OpenAI default model after folder pick", async () => {
    const patches: Array<{ directory: string; patch: Record<string, unknown> }> = []

    await expect(
      configureNotebookForOnboarding({
        authChoice: "chatgpt_plus",
        directory: "/repo",
        async openProject(directory) {
          expect(directory).toBe("/repo")
          return "/repo"
        },
        async loadProviderCatalog(directory) {
          expect(directory).toBe("/repo")
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
                models: [createModel("gpt-5", "GPT-5"), createModel("gpt-5-mini", "GPT-5 Mini")],
              }),
            ],
            default: {
              openai: "gpt-5-mini",
            },
          })
        },
        async patchProjectConfig(directory, patch) {
          patches.push({ directory, patch })
          return {}
        },
      }),
    ).resolves.toEqual({
      directory: "/repo",
      model: "openai/gpt-5-mini",
    })

    expect(patches).toEqual([
      {
        directory: "/repo",
        patch: { model: "openai/gpt-5-mini" },
      },
    ])
  })

  test("applies the Opencode free-model default after folder pick", async () => {
    await expect(
      configureNotebookForOnboarding({
        authChoice: "free_models",
        directory: "/repo",
        async openProject(directory) {
          return directory
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "opencode",
                name: "OpenCode Zen",
                connected: true,
                models: [createModel("zen-free", "Zen Free"), createModel("zen-plus", "Zen Plus")],
              }),
            ],
            default: {
              opencode: "zen-free",
            },
          })
        },
        async patchProjectConfig() {
          return {}
        },
      }),
    ).resolves.toEqual({
      directory: "/repo",
      model: "opencode/zen-free",
    })
  })
})
