import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  parseInAppBrowserProfileID,
  type InAppBrowserProfile,
} from "@buddy/browser-contract/profiles"
import { BrowserProfilesSection } from "../src/components/settings/settings-browser-profiles"
import {
  createBrowserPlatform,
  setRuntimePlatform,
  type InAppBrowserPlatform,
  type Platform,
  type PlatformStateStorage,
} from "../src/context/platform"
import { DEFAULT_IN_APP_BROWSER_SETTINGS } from "../src/lib/in-app-browser-settings"
import {
  retryInAppBrowserSettingsHydration,
  useInAppBrowserSettingsStore,
} from "../src/state/in-app-browser-settings-store"

type Deferred = {
  readonly promise: Promise<void>
  reject(error: Error): void
  resolve(): void
}

function deferred(): Deferred {
  let rejectPromise: ((error: Error) => void) | undefined
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve, reject) => {
    rejectPromise = reject
    resolvePromise = resolve
  })
  return {
    promise,
    reject(error) {
      if (!rejectPromise) throw new Error("Deferred rejection was not initialized")
      rejectPromise(error)
    },
    resolve() {
      if (!resolvePromise) throw new Error("Deferred resolution was not initialized")
      resolvePromise()
    },
  }
}

function profile(id: string, name: string): InAppBrowserProfile {
  const parsedID = parseInAppBrowserProfileID(id)
  if (!parsedID) throw new Error(`Invalid test profile ID: ${id}`)
  return { id: parsedID, name }
}

function requireElement<TElement extends Element>(element: TElement | null): TElement {
  if (!element) throw new Error("Expected element to exist")
  return element
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (!valueSetter) throw new Error("Expected the input value setter")
  valueSetter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function browserPlatform(): InAppBrowserPlatform {
  return {
    webPreferences: "",
    onMessage: () => () => undefined,
    onFavicon: () => () => undefined,
    onAudio: () => () => undefined,
    onShortcut: () => () => undefined,
    onNewTab: () => () => undefined,
    onCitation: () => () => undefined,
    captureCitation: async () => ({ _tag: "failed" as const, reason: "no-selection" as const }),
    markCitation: async () => ({ _tag: "not-found" as const }),
    unmarkCitation: async () => ({ _tag: "done" as const }),
    revealCitation: async () => ({ _tag: "not-found" as const }),
    setAppearance: async () => ({ _tag: "done" }),
    clearProfileData: async () => ({ _tag: "done" }),
    checkSafariFullDiskAccess: async () => false,
    listImportSources: async () => [],
    importCookies: async () => ({ _tag: "failed", reason: "readFailed" }),
    openFullDiskAccessSettings: async () => undefined,
  }
}

describe("Browser profile save concurrency", () => {
  let container: HTMLDivElement
  let root: Root
  let pendingFlushes: Deferred[]

  beforeEach(async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    pendingFlushes = []
    const storage: PlatformStateStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      flush: () => {
        const pending = deferred()
        pendingFlushes.push(pending)
        return pending.promise
      },
    }
    const platform: Platform = {
      ...createBrowserPlatform(),
      storage: () => storage,
    }
    setRuntimePlatform(platform)
    await retryInAppBrowserSettingsHydration()

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    for (const pending of pendingFlushes) pending.resolve()
    await act(async () => root.unmount())
    document.body.replaceChildren()
    useInAppBrowserSettingsStore.setState(DEFAULT_IN_APP_BROWSER_SETTINGS)
    setRuntimePlatform(createBrowserPlatform())
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderProfiles(profiles: readonly InAppBrowserProfile[]): Promise<void> {
    useInAppBrowserSettingsStore.setState({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      userProfiles: [...profiles],
    })
    await act(async () => {
      root.render(<BrowserProfilesSection browser={browserPlatform()} />)
    })
  }

  test("a failed rename does not overwrite a newer profile name", async () => {
    const work = profile("work", "Work")
    await renderProfiles([work])

    const input = requireElement(
      container.querySelector<HTMLInputElement>('[aria-label="Rename Work"]'),
    )
    await act(async () => {
      setInputValue(input, "First rename")
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(pendingFlushes).toHaveLength(1)

    await act(async () => {
      useInAppBrowserSettingsStore.getState().renameProfile({
        id: work.id,
        name: "Later rename",
      })
    })
    await act(async () => {
      const firstFlush = pendingFlushes.at(0)
      if (!firstFlush) throw new Error("Expected the first rename flush")
      firstFlush.reject(new Error("disk unavailable"))
      await firstFlush.promise.catch(() => undefined)
    })

    expect(useInAppBrowserSettingsStore.getState().userProfiles).toEqual([
      { id: work.id, name: "Later rename" },
    ])
  })

  test("a failed default change does not overwrite a newer selection", async () => {
    const work = profile("work", "Work")
    const personal = profile("personal", "Personal")
    await renderProfiles([work, personal])

    const menuTrigger = requireElement(
      container.querySelector<HTMLButtonElement>('[aria-label="Work options"]'),
    )
    await act(async () => {
      menuTrigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    })
    const setDefaultItem = requireElement(
      [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (item) => item.textContent === "Set as default",
      ) ?? null,
    )
    await act(async () => setDefaultItem.click())
    expect(pendingFlushes).toHaveLength(1)

    await act(async () => {
      useInAppBrowserSettingsStore.getState().setDefaultProfileID(personal.id)
    })
    await act(async () => {
      const firstFlush = pendingFlushes.at(0)
      if (!firstFlush) throw new Error("Expected the first default-profile flush")
      firstFlush.reject(new Error("disk unavailable"))
      await firstFlush.promise.catch(() => undefined)
    })

    expect(useInAppBrowserSettingsStore.getState().defaultProfileID).toBe(personal.id)
  })
})
