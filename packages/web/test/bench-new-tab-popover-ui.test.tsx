import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { IN_APP_BROWSER_URL_MAX_LENGTH } from "@buddy/browser-contract"
import { DEFAULT_IN_APP_BROWSER_PROFILE_ID } from "@buddy/browser-contract/profiles"
import { BenchNewTabPopover } from "../src/components/bench/bench-new-tab-popover"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { DEFAULT_IN_APP_BROWSER_SETTINGS } from "../src/lib/in-app-browser-settings"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"
import { useInAppBrowserHistoryStore } from "../src/state/in-app-browser-history-store"
import {
  retryInAppBrowserSettingsHydration,
  useInAppBrowserSettingsStore,
} from "../src/state/in-app-browser-settings-store"
import { installTestFetch, restoreTestFetch } from "./test-utils"

const DIRECTORY = "/workspace"
const originalFetch = globalThis.fetch

function desktopPlatform(): Platform {
  return {
    platform: "desktop",
    os: "macos",
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
    inAppBrowser: {
      webPreferences: "",
      onMessage: () => () => undefined,
      onFavicon: () => () => undefined,
      onAudio: () => () => undefined,
      onShortcut: () => () => undefined,
      setAppearance: async () => ({ _tag: "done" as const }),
      clearProfileData: async () => ({ _tag: "done" as const }),
      checkSafariFullDiskAccess: async () => false,
      listImportSources: async () => [],
      importCookies: async () => ({ _tag: "failed" as const, reason: "readFailed" as const }),
      openFullDiskAccessSettings: async () => undefined,
    },
  }
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (!valueSetter) throw new Error("Expected the input value setter")
  valueSetter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function installDeferredNotebookFileFetch(matches: readonly string[]) {
  let announceRequest!: (url: string) => void
  let releaseResponse!: (response: Response) => void
  const request = new Promise<string>((resolve) => {
    announceRequest = resolve
  })
  const response = new Promise<Response>((resolve) => {
    releaseResponse = resolve
  })
  installTestFetch(async (input) => {
    announceRequest(input instanceof Request ? input.url : input.toString())
    return response
  })
  return {
    request,
    respond: async () => {
      releaseResponse(Response.json({ matches, partial: false }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}

describe("Bench new-tab popover", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root

  beforeEach(async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    installTestFetch(async (input) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url.includes("/api/find/notebook-file")) {
        return Response.json({ matches: [], partial: false })
      }
      throw new Error(`Unexpected test request: ${url}`)
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false } },
    })
    queryClient.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), {
      objects: [],
      loadErrors: [],
    })
    queryClient.setQueryData(processedResourcesQueryKey(DIRECTORY), [])
    root = createRoot(container)
    await retryInAppBrowserSettingsHydration()
    useInAppBrowserSettingsStore.setState({
      defaultSearchEngine: "google",
      defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      userProfiles: [],
    })
    useInAppBrowserHistoryStore.setState({ byDirectory: {} })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    useInAppBrowserHistoryStore.setState({ byDirectory: {} })
    useInAppBrowserSettingsStore.setState(DEFAULT_IN_APP_BROWSER_SETTINGS)
    restoreTestFetch(originalFetch)
    document
      .querySelectorAll('[data-slot="popover-content"]')
      .forEach((popover) => popover.remove())
    container.remove()
    localStorage.clear()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function openPopover(platform: Platform = desktopPlatform()): Promise<HTMLInputElement> {
    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <QueryClientProvider client={queryClient}>
            <BenchNewTabPopover directory={DIRECTORY} />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-component="bench-new-tab-trigger"]')
        ?.click()
    })
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Open a file or URL…"]',
    )
    if (!input) throw new Error("Expected the unified new-tab input")
    return input
  }

  test("focuses a full-length input and selects an immediate URL action", async () => {
    const input = await openPopover()
    expect(document.activeElement).toBe(input)
    expect(input.maxLength).toBe(IN_APP_BROWSER_URL_MAX_LENGTH)

    await act(async () => setInputValue(input, "example.com/docs"))

    const action = document.querySelector('[data-action="bench-new-browser-input"]')
    expect(action?.textContent).toContain("example.com/docs")
    expect(action?.getAttribute("data-selected")).toBe("true")
  })

  test("keeps a matching history page ahead of the explicit web-search action", async () => {
    const notebookFetch = installDeferredNotebookFileFetch([])
    useInAppBrowserHistoryStore.setState({
      byDirectory: {
        [DIRECTORY]: [
          { url: "https://www.google.com/", title: "Google", visitedAt: 2 },
          { url: "https://example.com/", title: "Example", visitedAt: 1 },
        ],
      },
    })
    const input = await openPopover()

    await act(async () => setInputValue(input, "goo"))
    await notebookFetch.request
    await act(notebookFetch.respond)

    const actions = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-action="bench-new-browser-history"], [data-action="bench-new-browser-input"]',
      ),
      (item) => item.dataset.action,
    )
    expect(actions).toEqual(["bench-new-browser-history", "bench-new-browser-input"])
    expect(
      document
        .querySelector('[data-action="bench-new-browser-history"]')
        ?.getAttribute("data-selected"),
    ).toBe("true")
  })

  test("renders file paths returned by the notebook search endpoint", async () => {
    const notebookFetch = installDeferredNotebookFileFetch(["src/needle-file.ts"])
    const input = await openPopover()

    await act(async () => setInputValue(input, "needle"))
    const requestUrl = await notebookFetch.request
    await act(notebookFetch.respond)

    const fileResult = document.querySelector<HTMLElement>('[data-action="bench-new-tab-open"]')
    if (!fileResult) throw new Error("Expected a notebook file result")
    expect(requestUrl).toContain("/api/find/notebook-file")
    expect(requestUrl).toContain("query=needle")
    expect(fileResult?.textContent).toContain("needle-file.ts")
    expect(fileResult?.textContent).toContain("File")
    expect(fileResult.getAttribute("data-selected")).toBe("true")
    expect(
      document
        .querySelector('[data-action="bench-new-browser-input"]')
        ?.getAttribute("data-selected"),
    ).toBe("false")
  })

  test("prioritizes an ambiguous filename over its Browser fallback", async () => {
    const notebookFetch = installDeferredNotebookFileFetch(["README.md"])
    const input = await openPopover()

    await act(async () => setInputValue(input, "README.md"))
    await notebookFetch.request
    await act(notebookFetch.respond)

    const fileResult = document.querySelector<HTMLElement>('[data-action="bench-new-tab-open"]')
    if (!fileResult) throw new Error("Expected a notebook file result")
    const browserFallback = document.querySelector('[data-action="bench-new-browser-input"]')
    expect(fileResult.textContent).toContain("README.md")
    expect(fileResult.getAttribute("data-selected")).toBe("true")
    expect(browserFallback?.textContent).toContain("README.md")
    expect(browserFallback?.getAttribute("data-selected")).toBe("false")
  })

  test("does not let blank-tab commands swallow a typed web search", async () => {
    const notebookFetch = installDeferredNotebookFileFetch([])
    const input = await openPopover()

    await act(async () => setInputValue(input, "web"))
    await notebookFetch.request
    await act(notebookFetch.respond)

    const searchAction = document.querySelector<HTMLElement>(
      '[data-action="bench-new-browser-input"]',
    )
    if (!searchAction) throw new Error("Expected an explicit web-search action")
    expect(document.querySelector('[data-action="bench-new-browser-tab"]')).toBeNull()
    expect(searchAction.textContent).toContain("Search Google for “web”")
    expect(searchAction.getAttribute("data-selected")).toBe("true")
  })

  test("hides Browser actions when the Electron capability is unavailable", async () => {
    const input = await openPopover({ ...desktopPlatform(), inAppBrowser: undefined })
    expect(document.querySelector('[data-action="bench-new-browser-tab"]')).toBeNull()

    await act(async () => setInputValue(input, "example.com"))

    expect(document.querySelector('[data-action="bench-new-browser-input"]')).toBeNull()
  })
})
