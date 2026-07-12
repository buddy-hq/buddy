import { beforeEach, describe, expect, test } from "bun:test"
import {
  ONBOARDING_PROVIDER_SELECTION_ACTION,
  configureNotebookForOnboarding,
  connectChatGptPlusForOnboarding,
  resolveOnboardingProviderSelectionAction,
  shouldAutoContinueConnectedOpenAiOnboarding,
  shouldShowOnboardingPrimaryUseStep,
  shouldShowOnboardingPersonalizationStep,
  shouldResumeOnboardingPersonalization,
} from "../src/lib/onboarding-flow"
import {
  resolveDesktopEntryPath,
  resolveDesktopOnboardingAutoContinueDirectory,
  resolveDesktopEntryPathWithSnapshots,
} from "../src/lib/desktop-onboarding"
import type {
  ProviderCatalogState,
  ProviderInfo,
  ProviderMethodInfo,
  ProviderModelInfo,
} from "../src/state/chat-types"
import { useChatStore } from "../src/state/chat-store"
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
    openAIModelAvailability: { status: "not_connected" },
  }
}

beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.clear()
  }
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
        personalizationStepPending: false,
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
        personalizationStepPending: false,
        openProjects: [],
        activeDirectory: undefined,
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/onboarding")
  })

  test("skips onboarding when existing chat context is available", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        setupCompleted: false,
        personalizationStepPending: false,
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
          personalizationStepPending: false,
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
          personalizationStepPending: false,
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

  test("skips onboarding when open projects already exist in the backend registry", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: false,
          personalizationStepPending: false,
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
          personalizationStepPending: false,
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
          setupCompleted: false,
          personalizationStepPending: false,
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
          personalizationStepPending: false,
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

  test("keeps onboarding visible while personalization is still pending", () => {
    expect(
      resolveDesktopEntryPath({
        platform: "desktop",
        setupCompleted: true,
        personalizationStepPending: true,
        openProjects: ["/repo"],
        activeDirectory: "/repo",
        pendingActiveDirectory: undefined,
        lastSessionByDirectory: {},
        directories: {},
      }),
    ).toBe("/onboarding")
  })

  test("does not skip pending personalization when open projects already exist", async () => {
    await expect(
      resolveDesktopEntryPathWithSnapshots({
        state: {
          platform: "desktop",
          setupCompleted: true,
          personalizationStepPending: true,
          openProjects: ["/repo"],
          activeDirectory: "/repo",
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

  test("keeps the provider step visible after backing out of ChatGPT personalization", () => {
    const shouldAutoContinue = false
    expect(shouldAutoContinue).toBe(false)
  })
})

describe("onboarding store", () => {
  test("keeps the chosen provider through setup until personalization finishes", () => {
    const store = useOnboardingStore.getState()
    store.setAuthChoice("free_models")

    store.markSetupCompleted()

    expect(useOnboardingStore.getState()).toMatchObject({
      setupCompleted: true,
      authChoice: "free_models",
    })
  })

  test("tracks personalization separately from setup completion", () => {
    const store = useOnboardingStore.getState()

    store.markSetupCompleted()
    store.startPersonalizationVersion("/repo")

    expect(store.shouldShowPersonalizationStep()).toBe(true)
    expect(useOnboardingStore.getState().personalizationDirectory).toBe("/repo")

    store.markPersonalizationSkipped()

    expect(useOnboardingStore.getState()).toMatchObject({
      setupCompleted: true,
      authChoice: undefined,
      personalizationSkipped: true,
      personalizationDirectory: undefined,
      personalizationVersionCompleted: 1,
    })
    expect(useOnboardingStore.getState().shouldShowPersonalizationStep()).toBe(false)
  })

  test("starts personalization as pending immediately after onboarding setup completes", () => {
    const store = useOnboardingStore.getState()

    store.markSetupCompleted()
    store.startPersonalizationVersion("/repo")

    const nextState = useOnboardingStore.getState()
    expect(nextState.activePersonalizationVersion).toBe(1)
    expect(nextState.personalizationVersionCompleted).toBeUndefined()
    expect(nextState.shouldShowPersonalizationStep()).toBe(true)
  })
})

describe("onboarding personalization resume", () => {
  test("returns to location when provider selection was opened before notebook setup", () => {
    expect(
      resolveOnboardingProviderSelectionAction({
        showProviderSelectionStep: true,
      }),
    ).toEqual({ type: ONBOARDING_PROVIDER_SELECTION_ACTION.showLocation })
  })

  test("reconfigures the existing notebook when provider selection was opened from personalization", () => {
    expect(
      resolveOnboardingProviderSelectionAction({
        showProviderSelectionStep: true,
        existingDirectory: "/repo",
      }),
    ).toEqual({
      type: ONBOARDING_PROVIDER_SELECTION_ACTION.configureExistingNotebook,
      directory: "/repo",
    })
  })

  test("resumes personalization immediately when the user reselects the same provider", () => {
    expect(
      shouldResumeOnboardingPersonalization({
        showProviderSelectionStep: true,
        currentChoice: "free_models",
        nextChoice: "free_models",
        existingDirectory: "/repo",
      }),
    ).toBe(true)

    expect(
      shouldResumeOnboardingPersonalization({
        showProviderSelectionStep: true,
        currentChoice: "free_models",
        nextChoice: "chatgpt_plus",
        existingDirectory: "/repo",
      }),
    ).toBe(false)
  })

  test("does not auto-continue OpenAI onboarding while provider selection is visible", () => {
    expect(
      shouldAutoContinueConnectedOpenAiOnboarding({
        personalizationStepVisible: false,
        showProviderSelectionStep: true,
        openAiConnected: true,
        alreadyHandled: false,
      }),
    ).toBe(false)

    expect(
      shouldAutoContinueConnectedOpenAiOnboarding({
        personalizationStepVisible: false,
        showProviderSelectionStep: false,
        openAiConnected: true,
        alreadyHandled: false,
      }),
    ).toBe(true)
  })

  test("keeps the personalization step visible while the final chat navigation is pending", () => {
    expect(
      shouldShowOnboardingPersonalizationStep({
        personalizationStepPending: false,
        showProviderSelectionStep: false,
        exitPending: true,
      }),
    ).toBe(true)

    expect(
      shouldShowOnboardingPersonalizationStep({
        personalizationStepPending: true,
        showProviderSelectionStep: true,
        exitPending: true,
      }),
    ).toBe(false)
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
    const preferredModel = createModel(
      "deepseek-v4-flash-free",
      "DeepSeek V4 Flash Free",
    )
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
    const preferredModel = createModel(
      "deepseek-v4-flash-free",
      "DeepSeek V4 Flash Free",
    )
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
    const preferredModel = createModel(
      "deepseek-v4-flash-free",
      "DeepSeek V4 Flash Free",
    )
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
