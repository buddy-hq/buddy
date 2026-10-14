import "../happydom"
import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { UpdateState } from "@buddy/update-contract"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { UpdatesSettingsSection } from "../src/components/settings/settings-updates-section"

let container: HTMLDivElement | undefined
let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  container?.remove()
  container = undefined
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

async function render(state: UpdateState, onCheck: UpdateState = state) {
  const platform: Platform = {
    platform: "desktop",
    version: "1.0.0",
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
    getUpdateState: async () => state,
    checkUpdate: async () => onCheck,
  }
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <PlatformProvider value={platform}>
        <UpdatesSettingsSection />
      </PlatformProvider>,
    )
  })
}

const prodState: UpdateState = {
  revision: 0,
  ring: "stable",
  currentVersion: "1.0.0",
  activity: { status: "idle" },
  releaseNotes: [],
}
const betaState: UpdateState = { ...prodState, distribution: "beta", ring: "preview" }

test("shows a fixed Beta channel without the Stable/Preview selector", async () => {
  await render(betaState)
  expect(container?.querySelector('[data-action="settings-update-beta"]')?.textContent).toBe("Beta")
  expect(container?.querySelector('[data-action="settings-update-ring"]')).toBeNull()
  expect(container?.textContent).toContain("This app receives updates from the Beta channel.")
})

test("retains the prod Stable/Preview selector", async () => {
  await render(prodState)
  expect(container?.querySelector('[data-action="settings-update-ring"]')?.textContent).toContain(
    "Stable",
  )
  expect(container?.querySelector('[data-action="settings-update-beta"]')).toBeNull()
})

test("explains that Beta updates are not configured when its signing key is missing", async () => {
  await render(betaState, {
    ...betaState,
    revision: 1,
    failure: { stage: "check", reason: "not-configured" },
  })
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('[data-action="settings-check-updates"]')?.click()
  })
  const banner = container?.querySelector('[data-action="settings-update-banner"]')
  expect(banner?.textContent).toContain("Beta updates are not configured")
  expect(banner?.textContent).toContain("An update signing key has not been provisioned")
})
