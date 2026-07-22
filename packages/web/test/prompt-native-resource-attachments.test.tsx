import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import {
  NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT,
  NATIVE_SPREADSHEET_FORMATS,
  nativeResourceDefinitionFromPath,
} from "@buddy/workspace-file-policy"
import { act, createRef, type RefObject } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  PromptComposer,
  type PromptComposerAttachmentsApi,
} from "../src/components/prompt/prompt-composer"
import {
  createBrowserPlatform,
  setRuntimePlatform,
  type Platform,
} from "../src/context/platform"
import { flushPromptStorePersistence, usePromptStore } from "../src/state/prompt-store"

const TEST_DIRECTORY = "/repo"
const SPINNER_SETTLE_MS = 175

type PendingUpload = {
  resolve: (response: Response) => void
}

function createTestFetch(
  handler: (...input: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(handler, { preconnect: globalThis.fetch.preconnect })
}

async function flushEffects(delay = 0): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, delay))
}

function resetStore(): void {
  usePromptStore.setState({
    draftsByKey: {},
    historyByDirectory: {},
    historyNavigationByKey: {},
  })
  flushPromptStorePersistence()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function renderComposer(attachmentsApiRef: RefObject<PromptComposerAttachmentsApi | null>) {
  return (
    <PromptComposer
      directory={TEST_DIRECTORY}
      isBusy={false}
      mentionableAgents={[]}
      mentionableReferences={[]}
      slashCommands={[]}
      modelOptions={[{ key: "openai/gpt-5", label: "GPT-5", acceptsImages: true }]}
      selectedModelAcceptsImages
      selectedModel="openai/gpt-5"
      thinkingOptions={[{ key: "default", label: "Default" }]}
      selectedThinking="default"
      selectorMode="native"
      onModelChange={() => undefined}
      onThinkingChange={() => undefined}
      onSubmit={() => undefined}
      onAbort={() => undefined}
      onNewSession={() => undefined}
      attachmentsApiRef={attachmentsApiRef}
    />
  )
}

describe("native resource attachment staging", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    resetStore()
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
    resetStore()
    setRuntimePlatform(createBrowserPlatform())
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("shows immediate independent chips, delays spinners, limits copies to two, and gates only Send", async () => {
    const pending: PendingUpload[] = []
    let activeCopies = 0
    let maximumActiveCopies = 0
    let completedCopies = 0
    const platform: Platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      resolveDroppedFilePath: (file) => `/external/${file.name}`,
      fetch: createTestFetch(async () => {
        activeCopies += 1
        maximumActiveCopies = Math.max(maximumActiveCopies, activeCopies)
        const response = await new Promise<Response>((resolve) => pending.push({ resolve }))
        activeCopies -= 1
        return response
      }),
    }
    setRuntimePlatform(platform)
    const readAsDataUrl = spyOn(FileReader.prototype, "readAsDataURL")
    const attachmentsApiRef = createRef<PromptComposerAttachmentsApi>()

    await act(async () => {
      root.render(renderComposer(attachmentsApiRef))
      await flushEffects()
    })
    await act(async () => {
      await attachmentsApiRef.current?.addAttachments([
        new File(["one"], "one.xlsx"),
        new File(["two"], "two.xlsx"),
        new File(["three"], "three.xlsx"),
      ])
      await flushEffects()
    })

    expect(container.querySelectorAll('[data-component="file-attachment-chip"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-status="copying"]')).toHaveLength(3)
    expect(container.querySelectorAll('[aria-label="Copying file"]')).toHaveLength(0)
    expect(pending).toHaveLength(2)
    expect(maximumActiveCopies).toBe(2)
    expect(readAsDataUrl).not.toHaveBeenCalled()
    readAsDataUrl.mockRestore()
    expect(container.querySelector<HTMLButtonElement>('[data-action="prompt-submit"]')?.disabled).toBe(
      true,
    )
    expect(
      container.querySelector('[data-component="prompt-editor"]')?.getAttribute("contenteditable"),
    ).toBe("true")
    expect(container.querySelector("select")).not.toBeNull()

    await act(async () => {
      await flushEffects(SPINNER_SETTLE_MS)
    })
    expect(container.querySelectorAll('[aria-label="Copying file"]')).toHaveLength(3)

    function completeNext(): void {
      completedCopies += 1
      pending.shift()?.resolve(
        Response.json({
          uploadID: `upload000${completedCopies}`.slice(-10),
          displayName: `file-${completedCopies}.xlsx`,
          format: "xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          workspacePath: `uploads/file-${completedCopies}--abcdefghij.xlsx`,
          absolutePath: `${TEST_DIRECTORY}/uploads/file-${completedCopies}--abcdefghij.xlsx`,
          sizeBytes: completedCopies,
        }),
      )
    }

    await act(async () => {
      completeNext()
      await flushEffects()
    })
    expect(pending).toHaveLength(2)
    expect(container.querySelectorAll('[data-status="ready"]')).toHaveLength(1)

    await act(async () => {
      completeNext()
      completeNext()
      await flushEffects()
    })
    expect(container.querySelectorAll('[data-status="ready"]')).toHaveLength(3)
    expect(container.querySelector<HTMLButtonElement>('[data-action="prompt-submit"]')?.disabled).toBe(
      false,
    )
  })

  test("stages all six spreadsheet formats without reading their binaries into the renderer", async () => {
    const copiedSourcePaths: string[] = []
    const platform: Platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      resolveDroppedFilePath: (file) => `/external/${file.name}`,
      fetch: createTestFetch(async (request, init) => {
        const body: unknown =
          typeof init?.body === "string"
            ? JSON.parse(init.body)
            : request instanceof Request
              ? await request.clone().json()
              : undefined
        if (!isRecord(body) || typeof body.sourcePath !== "string") {
          throw new Error("Expected a notebook upload source path")
        }
        const sourcePath = body.sourcePath
        const definition = nativeResourceDefinitionFromPath(sourcePath)
        const displayName = sourcePath.split("/").at(-1)
        if (!definition || !displayName) throw new Error("Expected a native spreadsheet path")
        copiedSourcePaths.push(sourcePath)
        return Response.json({
          uploadID: "abcdefghij",
          displayName,
          format: definition.format,
          mime: definition.mime,
          workspacePath: `uploads/${displayName.replace(`.${definition.format}`, `--abcdefghij.${definition.format}`)}`,
          absolutePath: `${TEST_DIRECTORY}/uploads/${displayName.replace(`.${definition.format}`, `--abcdefghij.${definition.format}`)}`,
          sizeBytes: 10,
        })
      }),
    }
    setRuntimePlatform(platform)
    const readAsDataUrl = spyOn(FileReader.prototype, "readAsDataURL")
    const attachmentsApiRef = createRef<PromptComposerAttachmentsApi>()

    await act(async () => {
      root.render(renderComposer(attachmentsApiRef))
      await flushEffects()
    })
    await act(async () => {
      await attachmentsApiRef.current?.addAttachments(
        NATIVE_SPREADSHEET_FORMATS.map(
          (format) => new File([`fixture-${format}`], `attendance.${format}`),
        ),
      )
      await flushEffects(50)
    })

    expect(container.querySelectorAll('[data-component="file-attachment-chip"]')).toHaveLength(
      NATIVE_SPREADSHEET_FORMATS.length,
    )
    expect(container.querySelectorAll('[data-status="ready"]')).toHaveLength(
      NATIVE_SPREADSHEET_FORMATS.length,
    )
    expect(copiedSourcePaths).toEqual(
      NATIVE_SPREADSHEET_FORMATS.map((format) => `/external/attendance.${format}`),
    )
    expect(readAsDataUrl).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Excel spreadsheet")
    expect(container.textContent).toContain("Numbers spreadsheet")
    readAsDataUrl.mockRestore()
  })

  test("keeps failed chips visible and retries them when clicked", async () => {
    let requestCount = 0
    const platform: Platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      resolveDroppedFilePath: (file) => `/external/${file.name}`,
      fetch: createTestFetch(async () => {
        requestCount += 1
        if (requestCount === 1) {
          return Response.json({ error: "Copy failed in test" }, { status: 400 })
        }
        return Response.json({
          uploadID: "abcdefghij",
          displayName: "lesson.docx",
          format: "docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          workspacePath: "uploads/lesson--abcdefghij.docx",
          absolutePath: `${TEST_DIRECTORY}/uploads/lesson--abcdefghij.docx`,
          sizeBytes: 10,
        })
      }),
    }
    setRuntimePlatform(platform)
    const attachmentsApiRef = createRef<PromptComposerAttachmentsApi>()

    await act(async () => {
      root.render(renderComposer(attachmentsApiRef))
      await flushEffects()
    })
    await act(async () => {
      await attachmentsApiRef.current?.addAttachments([new File(["doc"], "lesson.docx")])
      await flushEffects()
    })
    const failedChip = container.querySelector<HTMLElement>('[data-status="error"]')
    expect(failedChip).not.toBeNull()
    expect(failedChip?.textContent).toContain("Copy failed")
    expect(container.querySelector<HTMLButtonElement>('[data-action="prompt-submit"]')?.disabled).toBe(
      true,
    )

    const removeButton = container.querySelector<HTMLButtonElement>(
      '[data-action="file-attachment-chip-remove"]',
    )
    const removeKeyDown = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      removeButton?.dispatchEvent(removeKeyDown)
      await flushEffects()
    })
    expect(removeKeyDown.defaultPrevented).toBe(false)
    expect(requestCount).toBe(1)
    expect(container.querySelector('[data-status="error"]')).not.toBeNull()

    await act(async () => {
      failedChip?.click()
      await flushEffects()
    })
    expect(requestCount).toBe(2)
    expect(container.querySelector('[data-status="ready"]')).not.toBeNull()
  })

  test("turns a null desktop path into a retryable copy error", async () => {
    let requestCount = 0
    const platform: Platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      resolveDroppedFilePath: () => null,
      fetch: createTestFetch(async () => {
        requestCount += 1
        return Response.json({})
      }),
    }
    setRuntimePlatform(platform)
    const attachmentsApiRef = createRef<PromptComposerAttachmentsApi>()

    await act(async () => {
      root.render(renderComposer(attachmentsApiRef))
      await flushEffects()
    })
    await act(async () => {
      await attachmentsApiRef.current?.addAttachments([new File(["slides"], "lesson.pptx")])
      await flushEffects()
    })

    expect(requestCount).toBe(0)
    expect(container.querySelector('[data-status="error"]')?.textContent).toContain("Copy failed")
    expect(container.querySelector<HTMLButtonElement>('[data-action="prompt-submit"]')?.disabled).toBe(
      true,
    )
  })

  test("enforces the shared native resource attachment limit before copying", async () => {
    const resolvedFiles: string[] = []
    const platform: Platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      resolveDroppedFilePath: (file) => {
        resolvedFiles.push(file.name)
        return `/external/${file.name}`
      },
      fetch: createTestFetch(async () =>
        Response.json({
          uploadID: "abcdefghij",
          displayName: "lesson.pdf",
          format: "pdf",
          mime: "application/pdf",
          workspacePath: "uploads/lesson--abcdefghij.pdf",
          absolutePath: `${TEST_DIRECTORY}/uploads/lesson--abcdefghij.pdf`,
          sizeBytes: 10,
        }),
      ),
    }
    setRuntimePlatform(platform)
    const attachmentsApiRef = createRef<PromptComposerAttachmentsApi>()

    await act(async () => {
      root.render(renderComposer(attachmentsApiRef))
      await flushEffects()
    })
    await act(async () => {
      await attachmentsApiRef.current?.addAttachments(
        Array.from(
          { length: NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT + 1 },
          (_, index) => new File(["pdf"], `lesson-${index + 1}.pdf`),
        ),
      )
      await flushEffects()
    })

    expect(container.querySelectorAll('[data-component="file-attachment-chip"]')).toHaveLength(
      NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT,
    )
    expect(resolvedFiles).toHaveLength(NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT)
    expect(resolvedFiles).not.toContain(`lesson-${NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT + 1}.pdf`)
  })

  test("does not recreate a copying chip after removal and late server completion", async () => {
    let completeUpload: ((response: Response) => void) | undefined
    const platform: Platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      resolveDroppedFilePath: (file) => `/external/${file.name}`,
      fetch: createTestFetch(
        () => new Promise<Response>((resolve) => (completeUpload = resolve)),
      ),
    }
    setRuntimePlatform(platform)
    const attachmentsApiRef = createRef<PromptComposerAttachmentsApi>()

    await act(async () => {
      root.render(renderComposer(attachmentsApiRef))
      await flushEffects()
    })
    await act(async () => {
      await attachmentsApiRef.current?.addAttachments([new File(["book"], "book.epub")])
      await flushEffects()
    })
    expect(container.querySelector('[data-status="copying"]')).not.toBeNull()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-action="file-attachment-chip-remove"]')
        ?.click()
      await flushEffects()
    })
    expect(container.querySelector('[data-component="file-attachment-chip"]')).toBeNull()

    await act(async () => {
      completeUpload?.(
        Response.json({
          uploadID: "abcdefghij",
          displayName: "book.epub",
          format: "epub",
          mime: "application/epub+zip",
          workspacePath: "uploads/book--abcdefghij.epub",
          absolutePath: `${TEST_DIRECTORY}/uploads/book--abcdefghij.epub`,
          sizeBytes: 10,
        }),
      )
      await flushEffects()
    })
    expect(container.querySelector('[data-component="file-attachment-chip"]')).toBeNull()
  })
})
