import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  PromptComposerToolbar,
  type PromptFastModeControl,
} from "../src/components/prompt/components/prompt-composer-toolbar"

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

async function renderToolbar(fastMode: PromptFastModeControl | undefined) {
  await act(async () => {
    root.render(
      <PromptComposerToolbar
        selectedModel="openai/gpt-5.5"
        selectedModelAcceptsImages={false}
        onModelChange={() => {}}
        modelNativeTriggerRef={createRef<HTMLSelectElement>()}
        modelRadixTriggerRef={createRef<HTMLButtonElement>()}
        groupedModelOptions={{
          ungrouped: [{ key: "openai/gpt-5.5", label: "GPT-5.5", acceptsImages: false }],
          grouped: [],
        }}
        selectorMode="native"
        selectedThinking="default"
        thinkingOptions={[{ key: "default", label: "Default" }]}
        onThinkingChange={() => {}}
        fastMode={fastMode}
      />,
    )
  })
  return container.querySelector<HTMLButtonElement>('[data-action="prompt-fast-mode"]')
}

test("hides the Fast toggle when the model has no fast mode", async () => {
  expect(await renderToolbar(undefined)).toBeNull()
})

test("shows Fast off and turns it on", async () => {
  const onChange = mock((_enabled: boolean) => {})
  const button = await renderToolbar({ enabled: false, onChange })

  expect(button?.getAttribute("aria-pressed")).toBe("false")
  expect(button?.textContent).toBe("Fast")
  await act(async () => button?.click())
  expect(onChange).toHaveBeenCalledWith(true)
})

test("shows Fast on and turns it off", async () => {
  const onChange = mock((_enabled: boolean) => {})
  const button = await renderToolbar({ enabled: true, onChange })

  expect(button?.getAttribute("aria-pressed")).toBe("true")
  await act(async () => button?.click())
  expect(onChange).toHaveBeenCalledWith(false)
})
