import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  resolveComposerAccessoryLayout,
  resolveComposerReplacementHeight,
} from "../src/components/prompt/composer-accessory-layout"
import { PromptComposer } from "../src/components/prompt/prompt-composer"
import { createBrowserPlatform, setRuntimePlatform } from "../src/context/platform"
import { useGameStore } from "../src/state/game-store"
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
  useGameStore.setState({
    isGameVisible: false,
    isPaused: false,
    isMinimized: false,
  })
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function renderPromptComposer(input: {
  onSubmit: Parameters<typeof PromptComposer>[0]["onSubmit"]
  compact?: boolean
  accessoryLayout?: Parameters<typeof PromptComposer>[0]["accessoryLayout"]
}) {
  return (
    <PromptComposer
      directory={TEST_DIRECTORY}
      isBusy={false}
      personaOptions={[
        { name: "buddy", label: "Buddy" },
        { name: "code", label: "Code" },
      ]}
      mentionableAgents={[]}
      mentionableReferences={[]}
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
      compact={input.compact}
      accessoryLayout={input.accessoryLayout}
      sessionContextUsage={<span data-testid="session-context" />}
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

  test("uses compact editor bounds only when requested", async () => {
    await act(async () => {
      root.render(
        renderPromptComposer({
          onSubmit: () => undefined,
        }),
      )
      await flushEffects()
    })

    const regularEditor = container.querySelector('[data-component="prompt-editor"]')
    expect(regularEditor?.classList.contains("min-h-[72px]")).toBe(true)
    expect(regularEditor?.classList.contains("max-h-[240px]")).toBe(true)
    expect(regularEditor?.classList.contains("pb-12")).toBe(true)

    await act(async () => {
      root.render(
        renderPromptComposer({
          compact: true,
          onSubmit: () => undefined,
        }),
      )
      await flushEffects()
    })

    const compactEditor = container.querySelector('[data-component="prompt-editor"]')
    expect(compactEditor?.classList.contains("min-h-[56px]")).toBe(true)
    expect(compactEditor?.classList.contains("max-h-[120px]")).toBe(true)
    expect(compactEditor?.classList.contains("pb-3")).toBe(true)
  })

  test("keeps the active game mounted when responsive placement changes", async () => {
    const expandedLayout = resolveComposerAccessoryLayout({
      paneHeight: 956,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const replacementLayout = resolveComposerAccessoryLayout({
      paneHeight: 360,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const renderWithLayout = (accessoryLayout: typeof expandedLayout) =>
      renderPromptComposer({
        accessoryLayout,
        onSubmit: () => undefined,
      })

    await act(async () => {
      root.render(renderWithLayout(expandedLayout))
      await flushEffects()
    })

    const arcadeButton = container.querySelector<HTMLButtonElement>(
      '[data-action="prompt-open-arcade"]',
    )
    expect(arcadeButton).not.toBeNull()

    await act(async () => {
      arcadeButton?.click()
      await flushEffects()
    })

    const initialGameDock = container.querySelector<HTMLElement>(
      '[data-component="prompt-game-dock"]',
    )
    expect(initialGameDock).not.toBeNull()

    await act(async () => {
      root.render(renderWithLayout(replacementLayout))
      await flushEffects()
    })

    const replacementGameDock = container.querySelector<HTMLElement>(
      '[data-component="prompt-game-dock"]',
    )
    expect(replacementGameDock).toBe(initialGameDock)
    expect(replacementGameDock?.style.height).toBe(
      `${resolveComposerReplacementHeight(replacementLayout)}px`,
    )
    expect(
      container.querySelector<HTMLElement>(
        '[data-component="prompt-composer-replacement-motion-host"]',
      )?.style.height,
    ).toBe("")

    await act(async () => {
      root.render(renderWithLayout(expandedLayout))
      await flushEffects()
    })

    expect(container.querySelector<HTMLElement>('[data-component="prompt-game-dock"]')).toBe(
      initialGameDock,
    )
  })
})
