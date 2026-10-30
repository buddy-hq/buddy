import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  PromptAccessModeSelect,
  type PromptAccessMode,
  type PromptAccessModeOption,
} from "../src/components/prompt/components/prompt-access-mode-select"

const OPTIONS: readonly PromptAccessModeOption[] = [
  { mode: "supervised", label: "Supervised", description: "Asks before commands." },
  { mode: "default", label: "Default", description: "Works freely in this notebook." },
  { mode: "full", label: "Full access", description: "Never asks." },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
})

async function renderSelect(
  mode: PromptAccessMode,
  selectorMode: "radix" | "native",
  onModeChange: (mode: PromptAccessMode) => void = () => {},
) {
  await act(async () => {
    root.render(
      <PromptAccessModeSelect
        mode={mode}
        options={OPTIONS}
        onModeChange={onModeChange}
        selectorMode={selectorMode}
      />,
    )
  })
  return container.querySelector<HTMLElement>('[data-action="prompt-access-mode"]')
}

test("Default and Supervised show an icon-only trigger named after the mode", async () => {
  for (const [mode, label] of [
    ["default", "Default"],
    ["supervised", "Supervised"],
  ] as const) {
    const trigger = await renderSelect(mode, "radix")
    expect(trigger?.getAttribute("aria-label")).toBe(`Access: ${label}`)
    expect(trigger?.textContent).toBe("")
  }
})

test("Full access shows a labelled trigger", async () => {
  const trigger = await renderSelect("full", "radix")
  expect(trigger?.textContent).toBe("Full access")
  expect(trigger?.getAttribute("data-mode")).toBe("full")
})

test("the native selector changes the mode", async () => {
  const onModeChange = mock((_mode: PromptAccessMode) => {})
  const select = await renderSelect("default", "native", onModeChange)
  if (!(select instanceof HTMLSelectElement)) throw new Error("Expected a native select")
  await act(async () => {
    select.value = "full"
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(onModeChange).toHaveBeenCalledWith("full")
})
