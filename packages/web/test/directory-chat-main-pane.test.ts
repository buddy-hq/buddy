import { afterEach, describe, expect, test } from "bun:test"
import type { Citation } from "@buddy/citation-contract"
import {
  openCitationSurface,
  resolveCitationSourceOpenTarget,
  resolveRevertedUserMessageCount,
  resolveAutoCompactionWarning,
  resolveCurrentSessionQuestions,
} from "../src/components/directory-chat/directory-chat-main-pane"
import { canEditImagesForModel } from "../src/lib/image-editing"
import { benchTargetKey, type BenchTarget } from "../src/lib/bench-navigation"
import { registerCitationSurfaceRevealer } from "../src/lib/citations/surface-revealers"
import {
  registerCitationNavigationHandler,
  requestCitationNavigation,
} from "../src/lib/citations/navigation"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createProviderInfo,
  createProviderModelInfo,
  createUserMessageInfo,
} from "./test-utils"

const cleanups: Array<() => void> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  await requestCitationNavigation(markdownCitation("clear-pending-test-state"))
})

const selector = { version: 1 as const, start: 0, end: 11, prefix: "", suffix: "" }

function markdownCitation(id: string): Citation {
  return {
    schemaVersion: 1,
    id,
    excerpt: "quoted text",
    source: { kind: "document", path: "notes/cited.md", selector },
  }
}

function readingCitation(id: string): Citation {
  return {
    schemaVersion: 1,
    id,
    excerpt: "quoted text",
    source: {
      kind: "reading",
      path: "books/cited.pdf",
      anchor: {
        kind: "pdf-text",
        segments: [{ pageIndex: 0, quads: [] }],
        quote: { exact: "quoted text" },
      },
    },
  }
}

const markdownTarget: BenchTarget = {
  type: "workspace-file",
  root: "notebook",
  path: "notes/cited.md",
  viewer: "markdown",
}

const readingFileTarget: BenchTarget = {
  type: "workspace-file",
  root: "notebook",
  path: "books/cited.pdf",
  viewer: "file",
}

function citationPath(citation: Citation) {
  const { source } = citation
  return source.kind === "document" || source.kind === "reading" ? source.path : undefined
}

function registerSourceSurface(target: BenchTarget, path: string, revealed: string[]) {
  const reveal = (citation: Citation) => {
    if (citationPath(citation) !== path) return false
    revealed.push(citation.id)
    return true
  }
  const unregisterRevealer = registerCitationSurfaceRevealer(benchTargetKey(target), reveal)
  const unregisterNavigation = registerCitationNavigationHandler(reveal)
  return () => {
    unregisterNavigation()
    unregisterRevealer()
  }
}

function registerCitationFallback(opened: string[]) {
  return registerCitationNavigationHandler(async (citation) => {
    const target = resolveCitationSourceOpenTarget(citation)
    if (!target || target.kind === "web") return false
    return openCitationSurface({
      citation,
      target,
      directory: "/notebook",
      openBench: async (request) => {
        opened.push(benchTargetKey(request.target))
        return { outcome: "committed" }
      },
      openResource: async (directory, resource) => {
        opened.push(`${directory}:${resource.path}`)
        return { outcome: "committed" }
      },
    })
  })
}

describe("directory chat main pane helpers", () => {
  test("reveals a mounted Markdown citation when the Bench fallback registered after the editor", async () => {
    const revealed: string[] = []
    const opened: string[] = []
    cleanups.push(registerSourceSurface(markdownTarget, "notes/cited.md", revealed))
    cleanups.push(registerCitationFallback(opened))

    await expect(requestCitationNavigation(markdownCitation("mounted"))).resolves.toBe(true)

    expect(opened).toEqual([benchTargetKey(markdownTarget)])
    expect(revealed).toEqual(["mounted"])
  })

  test("waits for the opened Markdown tab instead of revealing in another tab of the same file", async () => {
    const otherTabRevealed: string[] = []
    const revealed: string[] = []
    const opened: string[] = []
    const resourceObjectTarget: BenchTarget = {
      type: "object",
      ref: { kind: "resource", objectID: "resource-1", revisionID: null, itemID: null },
      viewID: "reader",
    }
    cleanups.push(registerSourceSurface(resourceObjectTarget, "notes/cited.md", otherTabRevealed))
    cleanups.push(registerCitationFallback(opened))

    await expect(requestCitationNavigation(markdownCitation("other-tab"))).resolves.toBe(true)
    expect(otherTabRevealed).toEqual([])

    cleanups.push(registerSourceSurface(markdownTarget, "notes/cited.md", revealed))
    await Promise.resolve()
    await Promise.resolve()

    expect(opened).toEqual([benchTargetKey(markdownTarget)])
    expect(otherTabRevealed).toEqual([])
    expect(revealed).toEqual(["other-tab"])
  })

  test("reveals a mounted reading citation when the Bench fallback registered after the reader", async () => {
    const revealed: string[] = []
    const opened: string[] = []
    cleanups.push(registerSourceSurface(readingFileTarget, "books/cited.pdf", revealed))
    cleanups.push(registerCitationFallback(opened))

    await expect(requestCitationNavigation(readingCitation("reader"))).resolves.toBe(true)

    expect(opened).toEqual(["/notebook:books/cited.pdf"])
    expect(revealed).toEqual(["reader"])
  })

  test("routes document citations to Markdown Bench instead of the raw file viewer", () => {
    expect(
      resolveCitationSourceOpenTarget({
        schemaVersion: 1,
        id: "document-citation",
        excerpt: "quoted text",
        source: {
          kind: "document",
          path: "basic-demo.md",
          selector: { version: 1, start: 0, end: 11, prefix: "", suffix: "" },
        },
      }),
    ).toEqual({
      kind: "markdown",
      target: {
        type: "workspace-file",
        root: "notebook",
        path: "basic-demo.md",
        viewer: "markdown",
      },
      replacesTarget: {
        type: "workspace-file",
        root: "notebook",
        path: "basic-demo.md",
        viewer: "file",
      },
    })
  })

  test("keeps PDF and EPUB citations on the reading-resource path", () => {
    expect(
      resolveCitationSourceOpenTarget({
        schemaVersion: 1,
        id: "reading-citation",
        excerpt: "quoted text",
        source: {
          kind: "reading",
          path: "books/example.pdf",
          anchor: {
            kind: "pdf-text",
            segments: [{ pageIndex: 0, quads: [] }],
            quote: { exact: "quoted text" },
          },
        },
      }),
    ).toEqual({ kind: "reading", path: "books/example.pdf" })
  })

  test("sends web citations to the Browser", () => {
    const source = {
      kind: "web" as const,
      url: "https://example.com/article",
      profileID: "default",
      selector: { version: 1 as const, start: 0, end: 11, prefix: "", suffix: "" },
    }
    expect(
      resolveCitationSourceOpenTarget({
        schemaVersion: 1,
        id: "web-citation",
        excerpt: "quoted text",
        source,
      }),
    ).toEqual({ kind: "web", source })
  })

  test("offers image editing only to image-capable OpenAI models", () => {
    expect(
      canEditImagesForModel({
        providerID: "openai",
        acceptsImages: true,
        chatGptOAuthReady: true,
      }),
    ).toBe(true)
    expect(
      canEditImagesForModel({
        providerID: "anthropic",
        acceptsImages: true,
        chatGptOAuthReady: true,
      }),
    ).toBe(false)
    expect(
      canEditImagesForModel({
        providerID: "openai",
        acceptsImages: false,
        chatGptOAuthReady: true,
      }),
    ).toBe(false)
    expect(
      canEditImagesForModel({
        providerID: "openai",
        acceptsImages: true,
        chatGptOAuthReady: false,
      }),
    ).toBe(false)
  })

  test("shows only pending questions for the active session", () => {
    const questions = resolveCurrentSessionQuestions({
      sessionID: "session-2",
      pendingQuestions: [
        {
          id: "question-1",
          sessionID: "session-1",
          questions: [],
        },
        {
          id: "question-2",
          sessionID: "session-2",
          questions: [],
        },
      ],
    })

    expect(questions.map((question) => question.id)).toEqual(["question-2"])
  })

  test("suppresses compaction warnings when auto-compaction is disabled", () => {
    const warning = resolveAutoCompactionWarning({
      autoCompactionEnabled: false,
      providers: [
        createProviderInfo({
          id: "anthropic",
          connected: true,
          models: [
            createProviderModelInfo({
              id: "sonnet",
              providerID: "anthropic",
              limit: {
                context: 200_000,
                input: 200_000,
                output: 32_000,
              },
            }),
          ],
        }),
      ],
      messages: [
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "assistant-1",
            sessionID: "session-1",
            providerID: "anthropic",
            modelID: "sonnet",
            time: { created: 1 },
            tokens: {
              input: 170_000,
              output: 10_000,
              reasoning: 0,
              cache: {
                read: 0,
                write: 0,
              },
            },
            cost: 0,
          }),
        ),
      ],
    })

    expect(warning).toBeUndefined()
  })

  test("counts only reverted user messages for the restore banner", () => {
    const count = resolveRevertedUserMessageCount({
      revertMessageID: "msg-2",
      messages: [
        createMessageWithParts(createUserMessageInfo({ id: "msg-1", sessionID: "session-1" })),
        createMessageWithParts(
          createAssistantMessageInfo({ id: "assistant-1", sessionID: "session-1" }),
        ),
        createMessageWithParts(createUserMessageInfo({ id: "msg-2", sessionID: "session-1" })),
        createMessageWithParts(
          createAssistantMessageInfo({ id: "assistant-2", sessionID: "session-1" }),
        ),
        createMessageWithParts(createUserMessageInfo({ id: "msg-3", sessionID: "session-1" })),
      ],
    })

    expect(count).toBe(2)
  })
})
