import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { PromptComposer } from "../src/components/prompt/prompt-composer"
import { createBrowserPlatform, setRuntimePlatform } from "../src/context/platform"
import {
  createTextPromptDraft,
  flushPromptStorePersistence,
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  usePromptStore,
} from "../src/state/prompt-store"

const TEST_DIRECTORY = "/repo"
const TEST_PROMPT = "yeah nice"

function resetPromptStore() {
  setRuntimePlatform(createBrowserPlatform())
  usePromptStore.setState({
    draftsByKey: {},
    historyByDirectory: {},
    historyNavigationByKey: {},
  })
  flushPromptStorePersistence()
  localStorage.removeItem(PROMPT_STORE_STORAGE_KEY)
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function renderPromptComposer(input: {
  onSubmit: Parameters<typeof PromptComposer>[0]["onSubmit"]
}) {
  return (
    <PromptComposer
      directory={TEST_DIRECTORY}
      isBusy={false}
      personaOptions={[{ name: "buddy", label: "Buddy" }]}
      mentionableAgents={[]}
      slashCommands={[]}
      modelOptions={[
        {
          key: "openai/gpt-5",
          label: "GPT-5",
          acceptsImages: true,
        },
      ]}
      selectedModelAcceptsImages
      selectedPersona="buddy"
      selectedModel="openai/gpt-5"
      thinkingOptions={[{ key: "default", label: "Default" }]}
      selectedThinking="default"
      selectorMode="native"
      onPersonaChange={() => undefined}
      onModelChange={() => undefined}
      onThinkingChange={() => undefined}
      onSubmit={input.onSubmit}
      onAbort={() => undefined}
      onNewSession={() => undefined}
    />
  )
}

describe("prompt composer submit", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    resetPromptStore()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    resetPromptStore()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("clears the local editor immediately while preserving the store draft for submit", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))

    let submittedValue = ""

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: (draft) => {
            submittedValue = draft.value
          },
        }),
      )
      await flushEffects()
    })

    const form = container.querySelector("#prompt-composer-form")

    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent).toContain(
      TEST_PROMPT,
    )
    expect(form).not.toBeNull()

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(submittedValue).toBe(TEST_PROMPT)
    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe("")
    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent?.trim()).toBe(
      "",
    )
  })

  test("restores the editor when the submit flow restores the draft in the store", async () => {
    const promptKey = getPromptScopeKey(TEST_DIRECTORY)
    const store = usePromptStore.getState()
    store.replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))

    let restoreDraft: (() => void) | undefined

    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => {
            usePromptStore.getState().clearDraft(promptKey)
            restoreDraft = () => {
              usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEST_PROMPT))
            }
          },
        }),
      )
      await flushEffects()
    })

    const form = container.querySelector("#prompt-composer-form")

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await flushEffects()
    })

    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent?.trim()).toBe(
      "",
    )

    await act(async () => {
      restoreDraft?.()
      await flushEffects()
    })

    expect(container.querySelector('[data-component="prompt-editor"]')?.textContent).toContain(
      TEST_PROMPT,
    )
  })
})
