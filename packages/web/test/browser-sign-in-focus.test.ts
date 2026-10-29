import "../happydom"
import { expect, test } from "bun:test"
import { createBrowserPlatform, getPlatform, setRuntimePlatform } from "../src/context/platform"
import { connectChatGptPlusForOnboarding } from "../src/lib/onboarding-flow"
import type { ProviderCatalogState } from "../src/state/chat-types"

function catalog(connected: boolean): ProviderCatalogState {
  return {
    providers: [
      {
        id: "openai",
        name: "OpenAI",
        source: "config",
        bundled: false,
        env: [],
        connected,
        models: [],
        methods: [{ type: "oauth", label: "ChatGPT browser" }],
      },
    ],
    default: {},
    openAIModelAvailability: { status: "not_connected" },
  }
}

test("only a completed browser sign-in started here returns to the desktop once", async () => {
  const previousPlatform = getPlatform()
  const focusRequests: string[] = []
  setRuntimePlatform({
    ...createBrowserPlatform(),
    platform: "desktop",
    async focusWindow() {
      focusRequests.push("focus")
    },
  })

  try {
    for (const outcome of [
      "success",
      "failure",
      "cancelled",
      "already-connected",
      "web",
    ] as const) {
      if (outcome === "web") setRuntimePlatform(createBrowserPlatform())
      const abort = new AbortController()
      const waiting = Promise.withResolvers<void>()
      const completion = Promise.withResolvers<void>()
      let connected = outcome === "already-connected"
      const signIn = connectChatGptPlusForOnboarding({
        signal: abort.signal,
        openLink() {},
        async loadProviderCatalogSnapshot() {
          return catalog(connected)
        },
        async authorizeProviderOAuth() {
          return {
            url: "https://example.test/sign-in",
            method: "auto",
            methodID: "chatgpt-browser",
            attemptID: "con_focus",
            instructions: "Sign in in the browser",
            expiresAt: Number.MAX_SAFE_INTEGER,
          }
        },
        async completeProviderOAuth() {
          waiting.resolve()
          await completion.promise
          connected = true
        },
        async cancelProviderOAuth() {},
        async reloadProviderRuntime() {},
      }).then(
        () => "connected",
        () => "not-connected",
      )

      if (outcome !== "already-connected") {
        await waiting.promise
        expect(focusRequests).toEqual(outcome === "success" ? [] : ["focus"])
        if (outcome === "cancelled") abort.abort()
        if (outcome === "failure") completion.reject(new Error("Sign-in failed"))
        else completion.resolve()
      }

      expect(await signIn).toBe(
        outcome === "failure" || outcome === "cancelled" ? "not-connected" : "connected",
      )
      expect(focusRequests).toEqual(["focus"])
    }
  } finally {
    setRuntimePlatform(previousPlatform)
  }
})
