import { afterEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchTabs } from "../src/components/bench/bench-tabs"
import { upsertBenchTab } from "../src/lib/bench-tabs"
import type { BenchTarget } from "../src/lib/bench-navigation"

const FIRST_TARGET = {
  type: "workspace-file",
  path: "docs/first.md",
  viewer: "markdown",
} satisfies BenchTarget
const SECOND_TARGET = {
  type: "workspace-file",
  path: "assets/second.png",
  viewer: "file",
} satisfies BenchTarget

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
})

describe("BenchTabs", () => {
  test("renders ordered tabs and supports focus, close, and middle-click close", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const first = upsertBenchTab([], FIRST_TARGET)
    const tabs = upsertBenchTab(first.tabs, SECOND_TARGET).tabs
    const activated: string[] = []
    const closed: string[] = []

    await act(async () => {
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <BenchTabs
            directory="/workspace"
            tabs={tabs}
            activeTabKey={first.activeTabKey}
            onActivate={(tabKey) => activated.push(tabKey)}
            onClose={(tabKey) => closed.push(tabKey)}
            onCloseOthers={() => undefined}
            onCloseToRight={() => undefined}
            onCloseAll={() => undefined}
          />
        </QueryClientProvider>,
      )
    })

    const renderedTabs = container.querySelectorAll('[data-component="bench-tab"]')
    const activationTabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    expect([...renderedTabs].map((tab) => tab.textContent)).toEqual(["first.md", "second.png"])
    expect(renderedTabs[0]?.classList.contains("composer-surface-tab")).toBeTrue()
    expect(renderedTabs[0]?.classList.contains("composer-grain")).toBeTrue()
    expect(renderedTabs[1]?.classList.contains("composer-surface-tab")).toBeFalse()
    expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe(
      "horizontal",
    )

    await act(async () => {
      activationTabs[0]?.focus()
      activationTabs[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(activationTabs[1])
    expect(activated).toEqual([tabs[1]?.key])

    await act(async () => {
      activationTabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }))
    })
    expect(document.activeElement).toBe(activationTabs[0])
    expect(activated).toEqual([tabs[1]?.key, tabs[0]?.key])

    await act(async () => {
      activationTabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }))
    })
    expect(document.activeElement).toBe(activationTabs[1])
    expect(activated).toEqual([tabs[1]?.key, tabs[0]?.key, tabs[1]?.key])

    await act(async () => {
      activationTabs[1]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(activationTabs[0])
    expect(activated).toEqual([
      tabs[1]?.key,
      tabs[0]?.key,
      tabs[1]?.key,
      tabs[0]?.key,
    ])
    activated.length = 0

    await act(async () => {
      activationTabs[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      renderedTabs[0]?.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }))
      container?.querySelector<HTMLButtonElement>('[aria-label="Close second.png"]')?.click()
    })

    expect(activated).toEqual([tabs[1]?.key])
    expect(closed).toEqual([tabs[0]?.key, tabs[1]?.key])
  })
})
