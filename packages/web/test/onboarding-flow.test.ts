import "../happydom"
import { beforeEach, describe, expect, test } from "bun:test"
import type { ProviderAuthAuthorization } from "@opencode-ai/sdk/v2/client"
import {
  CINEMATIC_ONBOARDING_SCENE,
  activateDirectoryForOnboarding,
  configureNotebookForOnboarding,
  connectChatGptPlusForOnboarding,
  resolveCinematicOnboardingScene,
  shouldAutoContinueConnectedOpenAiOnboarding,
  shouldShowOnboardingPrimaryUseStep,
} from "../src/lib/onboarding-flow"
import { ONBOARDING_STEPS } from "../src/components/onboarding/cinematic"
import { browserLocalStorage } from "../src/state/parse-external"
import {
  resolveDesktopEntryPath,
  resolveDesktopEntryPathWithSnapshots,
} from "../src/lib/desktop-onboarding"
import type {
  ProviderCatalogState,
  ProviderInfo,
  ProviderMethodInfo,
  ProviderModelInfo,
} from "../src/state/chat-types"
import { useChatStore } from "../src/state/chat-store"
import { ONBOARDING_STORAGE_KEY, useOnboardingStore } from "../src/state/onboarding-store"

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
  openAIModelAvailability?: ProviderCatalogState["openAIModelAvailability"]
}): ProviderCatalogState {
  return {
    providers: input.providers,
    default: input.default ?? {},
    openAIModelAvailability: input.openAIModelAvailability ?? { status: "not_connected" },
  }
}

beforeEach(() => {
  browserLocalStorage()?.clear()
  useOnboardingStore.getState().reset()
  useChatStore.getState().resetRuntimeState()
})

describe("desktop onboarding entry routing", () => {
  test("skips primary-use selection when it has already been saved", () => {
    expect(shouldShowOnboardingPrimaryUseStep(undefined)).toBe(true)
    expect(shouldShowOnboardingPrimaryUseStep("learn")).toBe(false)
    expect(shouldShowOnboardingPrimaryUseStep("teach")).toBe(false)
  })

  test("redirects a first desktop launch to onboarding", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        setupCompleted: false,
        openProjects: [],
        activeDirectory: undefined,
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/onboarding")
  })

  test("keeps onboarding visible when setup is complete without notebook context", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        setupCompleted: true,
        openProjects: [],
        activeDirectory: undefined,
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/onboarding")
  })

  test("keeps onboarding visible when notebook creation outlives incomplete setup", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        setupCompleted: false,
        openProjects: ["/repo"],
        activeDirectory: "/repo",
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/onboarding")
  })

  test("skips onboarding when setup and existing chat context are complete", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        setupCompleted: true,
        openProjects: ["/repo"],
        activeDirectory: "/repo",
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/chat")
  })

  test("keeps onboarding when setup is complete but the backend has no open projects", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: true,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return []
        },
      }),
    ).resolves.toBe("/onboarding")
  })

  test("ignores stale persisted chat state when the backend has no open projects", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: true,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: "/old-notebook",
          lastSessionByDirectory: { "/old-notebook": "session-id" },
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return []
        },
      }),
    ).resolves.toBe("/onboarding")
  })

  test("does not let a partial backend notebook registration attest completed setup", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: false,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return ["/repo"]
        },
      }),
    ).resolves.toBe("/onboarding")
  })

  test("uses the backend registry after setup is complete", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: true,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return ["/repo"]
        },
      }),
    ).resolves.toBe("/chat")
  })

  test("keeps onboarding when the backend has no open projects yet", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: false,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return []
        },
      }),
    ).resolves.toBe("/onboarding")
  })

  test("skips onboarding when the backend reports notebook recovery is available", async () => {
    useChatStore.getState().setOpenProjectsRecovery({ needed: true })

    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: true,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          return []
        },
      }),
    ).resolves.toBe("/chat")
  })

  test("keeps onboarding when the backend snapshot cannot be read", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: false,
          openProjects: [],
          activeDirectory: undefined,
          pendingActiveDirectory: undefined,
          lastSessionByDirectory: {},
          directories: {},
        },
        async loadOpenProjectsSnapshot() {
          throw new Error("network down")
        },
      }),
    ).resolves.toBe("/onboarding")
  })
})

describe("onboarding store", () => {
  test("completes onboarding after the notebook setup finishes", () => {
    const store = useOnboardingStore.getState()
    store.setAuthChoice("free_models")

    store.markSetupCompleted()

    expect(useOnboardingStore.getState()).toMatchObject({
      setupCompleted: true,
      authChoice: undefined,
    })
  })

  test("migrates a completed onboarding record without retaining its details step", async () => {
    localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        state: {
          setupCompleted: true,
          authChoice: "free_models",
          activePersonalizationVersion: 1,
          personalizationVersionCompleted: undefined,
          personalizationDirectory: "/repo",
        },
        version: 2,
      }),
    )

    await useOnboardingStore.persist.rehydrate()

    expect(useOnboardingStore.getState()).toMatchObject({
      setupCompleted: true,
      authChoice: "free_models",
    })
    expect("activePersonalizationVersion" in useOnboardingStore.getState()).toBe(false)
  })
})

describe("cinematic onboarding", () => {
  test("does not include personal details as an onboarding step", () => {
    expect(ONBOARDING_STEPS).toEqual(["mode", "engine", "location"])
  })

  test("renders the finish scene after onboarding completes", () => {
    expect(
      resolveCinematicOnboardingScene({
        introVisible: false,
        introComplete: true,
        finished: true,
      }),
    ).toBe(CINEMATIC_ONBOARDING_SCENE.finish)
  })

  test("does not auto-continue OpenAI onboarding while provider selection is visible", () => {
    expect(
      shouldAutoContinueConnectedOpenAiOnboarding({
        showProviderSelectionStep: true,
        openAiConnected: true,
        alreadyHandled: false,
      }),
    ).toBe(false)

    expect(
      shouldAutoContinueConnectedOpenAiOnboarding({
        showProviderSelectionStep: false,
        openAiConnected: true,
        alreadyHandled: false,
      }),
    ).toBe(true)
  })
})

describe("onboarding directory activation", () => {
  test("completes only committed directory transitions", async () => {
    await expect(
      activateDirectoryForOnboarding({
        directory: "/repo",
        async activateDirectory() {
          return {
            outcome: "committed",
            transitionID: 1,
            value: { directory: "/repo" },
          }
        },
      }),
    ).resolves.toBe(true)

    await expect(
      activateDirectoryForOnboarding({
        directory: "/repo",
        async activateDirectory() {
          return {
            outcome: "noop",
            transitionID: 1,
            value: { directory: "/repo" },
          }
        },
      }),
    ).resolves.toBe(true)
  })

  test("keeps onboarding incomplete when the directory transition does not commit", async () => {
    await expect(
      activateDirectoryForOnboarding({
        directory: "/repo",
        async activateDirectory() {
          return { outcome: "blocked", transitionID: 1 }
        },
      }),
    ).resolves.toBe(false)

    await expect(
      activateDirectoryForOnboarding({
        directory: "/repo",
        async activateDirectory() {
          return { outcome: "superseded", transitionID: 1 }
        },
      }),
    ).resolves.toBe(false)
  })

  test("preserves directory activation failures", async () => {
    const error = new Error("activation failed")

    await expect(
      activateDirectoryForOnboarding({
        directory: "/repo",
        async activateDirectory() {
          return { outcome: "failed", transitionID: 1, error }
        },
      }),
    ).rejects.toBe(error)
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
        async cancelProviderOAuth() {},
        onAuthenticated() {
          calls.push("authenticated")
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
      "authenticated",
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
        async cancelProviderOAuth() {},
        async completeProviderOAuth() {},
        async reloadProviderRuntime() {},
      }),
    ).rejects.toThrow("Authorization cancelled")
  })

  test("cancels the server-side authorization when the browser wait is aborted", async () => {
    const abort = new AbortController()
    let completeStarted: (() => void) | undefined
    const completeReady = new Promise<void>((resolve) => {
      completeStarted = resolve
    })
    const neverCompletes = new Promise<void>(() => {})
    let cancelCalls = 0

    const connection = connectChatGptPlusForOnboarding({
      signal: abort.signal,
      openLink() {},
      async loadProviderCatalogSnapshot() {
        return createCatalog({
          providers: [
            createProvider({
              id: "openai",
              name: "OpenAI",
              connected: false,
              methods: [{ type: "oauth", label: "ChatGPT Pro/Plus (browser)" }],
            }),
          ],
        })
      },
      async authorizeProviderOAuth() {
        return {
          url: "https://chatgpt.example/auth",
          method: "auto",
          instructions: "Complete authorization in your browser.",
        }
      },
      async completeProviderOAuth() {
        completeStarted?.()
        await neverCompletes
      },
      async cancelProviderOAuth() {
        cancelCalls += 1
      },
      async reloadProviderRuntime() {},
    }).then(
      () => undefined,
      (cause) => cause,
    )

    await completeReady
    abort.abort()

    await expect(connection).resolves.toEqual(
      expect.objectContaining({ message: "Sign-in cancelled." }),
    )
    expect(cancelCalls).toBe(1)
  })

  test("cancels an authorization that finishes starting after the user aborts", async () => {
    const abort = new AbortController()
    let resolveAuthorization: ((authorization: ProviderAuthAuthorization) => void) | undefined
    const authorization = new Promise<ProviderAuthAuthorization>((resolve) => {
      resolveAuthorization = resolve
    })
    let browserOpened = false
    let completeCalled = false
    let cancelCalls = 0

    const connection = connectChatGptPlusForOnboarding({
      signal: abort.signal,
      openLink() {
        browserOpened = true
      },
      async loadProviderCatalogSnapshot() {
        return createCatalog({
          providers: [
            createProvider({
              id: "openai",
              name: "OpenAI",
              connected: false,
              methods: [{ type: "oauth", label: "ChatGPT Pro/Plus (browser)" }],
            }),
          ],
        })
      },
      async authorizeProviderOAuth() {
        return authorization
      },
      async completeProviderOAuth() {
        completeCalled = true
      },
      async cancelProviderOAuth() {
        cancelCalls += 1
      },
      async reloadProviderRuntime() {},
    }).then(
      () => undefined,
      (cause) => cause,
    )

    await Bun.sleep(0)
    abort.abort()
    resolveAuthorization?.({
      url: "https://chatgpt.example/auth",
      method: "auto",
      instructions: "Complete authorization in your browser.",
    })

    await expect(connection).resolves.toEqual(
      expect.objectContaining({ message: "Sign-in cancelled." }),
    )
    expect(cancelCalls).toBe(1)
    expect(browserOpened).toBe(false)
    expect(completeCalled).toBe(false)
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
        async cancelProviderOAuth() {},
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

  test("restarts OAuth when an existing OpenAI connection requires reconnection", async () => {
    const calls: string[] = []
    const catalog = createCatalog({
      providers: [
        createProvider({
          id: "openai",
          name: "OpenAI",
          connected: true,
          methods: [{ type: "oauth", label: "ChatGPT Pro/Plus (browser)" }],
          models: [createModel("gpt-5", "GPT-5")],
        }),
      ],
      default: { openai: "gpt-5" },
    })

    await connectChatGptPlusForOnboarding({
      forceReconnect: true,
      openLink() {
        calls.push("openLink")
      },
      async loadProviderCatalogSnapshot() {
        calls.push("loadCatalog")
        return catalog
      },
      async authorizeProviderOAuth() {
        calls.push("authorize")
        return {
          url: "https://chatgpt.example/auth",
          method: "auto",
          instructions: "Complete authorization in your browser.",
        }
      },
      async completeProviderOAuth() {
        calls.push("complete")
      },
      async cancelProviderOAuth() {},
      async reloadProviderRuntime() {
        calls.push("reload")
      },
    })

    expect(calls).toEqual([
      "loadCatalog",
      "authorize",
      "openLink",
      "complete",
      "reload",
      "loadCatalog",
    ])
  })
})

describe("notebook onboarding configuration", () => {
  test("prefers GPT-5.6 Sol with high reasoning when the account catalog is ready", async () => {
    const sol = createModel("gpt-5.6-sol", "GPT-5.6 Sol")
    sol.variants = ["medium", "high", "xhigh"]
    const terra = createModel("gpt-5.6-terra", "GPT-5.6 Terra")
    terra.variants = ["medium", "high", "xhigh"]

    await expect(
      configureNotebookForOnboarding({
        authChoice: "chatgpt_plus",
        async prepareNotebook() {
          return "/repo"
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
                models: [sol, terra],
              }),
            ],
            default: { openai: "gpt-5.4" },
            openAIModelAvailability: {
              status: "ready",
              modelIDs: ["gpt-5.6-sol", "gpt-5.6-terra"],
              fetchedAt: "2026-07-29T00:00:00.000Z",
              refreshing: false,
            },
          })
        },
      }),
    ).resolves.toEqual({
      directory: "/repo",
      model: "openai/gpt-5.6-sol",
      variant: "high",
    })
  })

  test("falls back to GPT-5.6 Luna with extra-high reasoning when Sol is unavailable", async () => {
    const luna = createModel("gpt-5.6-luna", "GPT-5.6 Luna")
    luna.variants = ["medium", "high", "xhigh"]
    const terra = createModel("gpt-5.6-terra", "GPT-5.6 Terra")
    terra.variants = ["medium", "high", "xhigh"]

    await expect(
      configureNotebookForOnboarding({
        authChoice: "chatgpt_plus",
        async prepareNotebook() {
          return "/repo"
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
                models: [terra, luna],
              }),
            ],
            default: { openai: "gpt-5.6-terra" },
            openAIModelAvailability: {
              status: "ready",
              modelIDs: ["gpt-5.6-terra", "gpt-5.6-luna"],
              fetchedAt: "2026-07-29T00:00:00.000Z",
              refreshing: false,
            },
          })
        },
      }),
    ).resolves.toEqual({
      directory: "/repo",
      model: "openai/gpt-5.6-luna",
      variant: "xhigh",
    })
  })

  test("refreshes account availability before selecting Sol", async () => {
    const sol = createModel("gpt-5.6-sol", "GPT-5.6 Sol")
    sol.variants = ["high"]
    let catalogLoads = 0
    const calls: string[] = []

    await expect(
      configureNotebookForOnboarding({
        authChoice: "chatgpt_plus",
        async prepareNotebook() {
          return "/repo"
        },
        async loadProviderCatalog() {
          calls.push("load")
          catalogLoads += 1
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
                models: [sol],
              }),
            ],
            default: { openai: "gpt-5.4" },
            openAIModelAvailability:
              catalogLoads === 1
                ? { status: "loading" }
                : {
                    status: "ready",
                    modelIDs: ["gpt-5.6-sol"],
                    fetchedAt: "2026-07-29T00:00:00.000Z",
                    refreshing: false,
                  },
          })
        },
        async refreshOpenAIModelAvailability() {
          calls.push("refresh")
          return {
            status: "ready",
            modelIDs: ["gpt-5.6-sol"],
            fetchedAt: "2026-07-29T00:00:00.000Z",
            refreshing: false,
          }
        },
      }),
    ).resolves.toEqual({
      directory: "/repo",
      model: "openai/gpt-5.6-sol",
      variant: "high",
    })
    expect(calls).toEqual(["load", "refresh", "load"])
  })

  test("uses Luna when account availability remains unready", async () => {
    const sol = createModel("gpt-5.6-sol", "GPT-5.6 Sol")
    sol.variants = ["high"]
    const luna = createModel("gpt-5.6-luna", "GPT-5.6 Luna")
    luna.variants = ["xhigh"]
    const terra = createModel("gpt-5.6-terra", "GPT-5.6 Terra")
    terra.variants = ["xhigh"]

    await expect(
      configureNotebookForOnboarding({
        authChoice: "chatgpt_plus",
        async prepareNotebook() {
          return "/repo"
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
                models: [sol, terra, luna],
              }),
            ],
            default: { openai: "gpt-5.6-terra" },
            openAIModelAvailability: { status: "loading" },
          })
        },
        async refreshOpenAIModelAvailability() {
          return { status: "error" }
        },
      }),
    ).resolves.toEqual({
      directory: "/repo",
      model: "openai/gpt-5.6-luna",
      variant: "xhigh",
    })
  })

  test("returns the connected OpenAI default model after folder pick without writing project config", async () => {
    const PREPARED_DIRECTORY = "/repo" as const

    await expect(
      configureNotebookForOnboarding({
        authChoice: "chatgpt_plus",
        async prepareNotebook() {
          return PREPARED_DIRECTORY
        },
        async loadProviderCatalog(directory) {
          expect(directory).toBe(PREPARED_DIRECTORY)
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
      }),
    ).resolves.toEqual({
      directory: PREPARED_DIRECTORY,
      model: "openai/gpt-5-mini",
    })
  })

  test("returns the Opencode free-model default after folder pick", async () => {
    const PREPARED_DIRECTORY = "/repo" as const

    await expect(
      configureNotebookForOnboarding({
        authChoice: "free_models",
        async prepareNotebook() {
          return PREPARED_DIRECTORY
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
      }),
    ).resolves.toEqual({
      directory: PREPARED_DIRECTORY,
      model: "opencode/zen-free",
    })
  })

  test("returns the Opencode free-model default even when the provider is not marked connected", async () => {
    const PREPARED_DIRECTORY = "/repo" as const

    await expect(
      configureNotebookForOnboarding({
        authChoice: "free_models",
        async prepareNotebook() {
          return PREPARED_DIRECTORY
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "opencode",
                name: "OpenCode Zen",
                connected: false,
                models: [createModel("zen-free", "Zen Free")],
              }),
            ],
            default: {
              opencode: "zen-free",
            },
          })
        },
      }),
    ).resolves.toEqual({
      directory: PREPARED_DIRECTORY,
      model: "opencode/zen-free",
    })
  })

  test("prefers DeepSeek V4 Flash with max reasoning when OpenAI is not connected", async () => {
    const PREPARED_DIRECTORY = "/repo" as const
    const preferredModel = createModel("deepseek-v4-flash-free", "DeepSeek V4 Flash Free")
    preferredModel.variants = ["high", "max"]

    await expect(
      configureNotebookForOnboarding({
        authChoice: "free_models",
        async prepareNotebook() {
          return PREPARED_DIRECTORY
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: false,
              }),
              createProvider({
                id: "opencode",
                name: "OpenCode Zen",
                models: [createModel("zen-free", "Zen Free"), preferredModel],
              }),
            ],
            default: {
              opencode: "zen-free",
            },
          })
        },
      }),
    ).resolves.toEqual({
      directory: PREPARED_DIRECTORY,
      model: "opencode/deepseek-v4-flash-free",
      variant: "max",
    })
  })

  test("keeps the current free-model default when OpenAI is connected", async () => {
    const PREPARED_DIRECTORY = "/repo" as const
    const preferredModel = createModel("deepseek-v4-flash-free", "DeepSeek V4 Flash Free")
    preferredModel.variants = ["max"]

    await expect(
      configureNotebookForOnboarding({
        authChoice: "free_models",
        async prepareNotebook() {
          return PREPARED_DIRECTORY
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "openai",
                name: "OpenAI",
                connected: true,
              }),
              createProvider({
                id: "opencode",
                name: "OpenCode Zen",
                models: [createModel("zen-free", "Zen Free"), preferredModel],
              }),
            ],
            default: {
              opencode: "zen-free",
            },
          })
        },
      }),
    ).resolves.toEqual({
      directory: PREPARED_DIRECTORY,
      model: "opencode/zen-free",
    })
  })

  test("keeps the current free-model default when the preferred model lacks max reasoning", async () => {
    const PREPARED_DIRECTORY = "/repo" as const
    const preferredModel = createModel("deepseek-v4-flash-free", "DeepSeek V4 Flash Free")
    preferredModel.variants = ["high"]

    await expect(
      configureNotebookForOnboarding({
        authChoice: "free_models",
        async prepareNotebook() {
          return PREPARED_DIRECTORY
        },
        async loadProviderCatalog() {
          return createCatalog({
            providers: [
              createProvider({
                id: "opencode",
                name: "OpenCode Zen",
                models: [createModel("zen-free", "Zen Free"), preferredModel],
              }),
            ],
            default: {
              opencode: "zen-free",
            },
          })
        },
      }),
    ).resolves.toEqual({
      directory: PREPARED_DIRECTORY,
      model: "opencode/zen-free",
    })
  })
})
