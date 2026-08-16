import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Markdown } from "../src/components/markdown/Markdown"
import { MarkdownHtmlSegment } from "../src/components/markdown/markdown-html-segment"
import { resetMarkdownWorkerForTests } from "../src/components/markdown/markdown-worker"
import {
  parseBooleanValue,
  parseBuddyConfigObject,
  parseFiniteNumber,
  parseStringValue,
  type TBuddyConfigValue,
} from "./parse-test-values"

type THighlightWorkerMessage = {
  type?: string
  id?: number
  key?: string
  text?: string
  complete?: boolean
}

function parseHighlightWorkerMessage<TValue>(value: TValue): THighlightWorkerMessage | undefined {
  const record = parseBuddyConfigObject(value)
  if (record === undefined) return undefined
  const type = parseStringValue(record.type)
  const id = parseFiniteNumber(record.id)
  const key = parseStringValue(record.key)
  const text = parseStringValue(record.text)
  const complete = parseBooleanValue(record.complete)
  return Object.assign(
    {},
    type === undefined ? undefined : { type },
    id === undefined ? undefined : { id },
    key === undefined ? undefined : { key },
    text === undefined ? undefined : { text },
    complete === undefined ? undefined : { complete },
  )
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

async function flushUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flushEffects()
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
}

describe("streaming markdown rendering", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    resetMarkdownWorkerForTests()
    container.remove()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("retains completed block DOM while only the live tail changes", async () => {
    await act(async () => {
      root.render(
        <MarkdownHtmlSegment
          text={"Stable paragraph.\n\nFirst tail"}
          cacheKey="stream"
          streaming
        />,
      )
      await flushEffects()
    })

    const stableBlock = container.querySelector('[data-markdown-block-key="stream:block:0"]')
    expect(stableBlock).not.toBeNull()

    await act(async () => {
      root.render(
        <MarkdownHtmlSegment
          text={"Stable paragraph.\n\nFirst tail grows"}
          cacheKey="stream"
          streaming
        />,
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-markdown-block-key="stream:block:0"]')).toBe(stableBlock)
    expect(container.textContent).toContain("First tail grows")
  })

  test("keeps caller typography classes on the authoritative prose root", async () => {
    await act(async () => {
      root.render(
        <Markdown
          text="Custom typography"
          cacheKey="custom-typography"
          className="text-xl text-text-interactive-base"
        />,
      )
      await flushEffects()
    })

    const documentRoot = container.querySelector<HTMLElement>("[data-markdown-document]")
    const proseRoots = container.querySelectorAll<HTMLElement>(".prose")
    if (!documentRoot) {
      throw new Error("Expected a Markdown document root")
    }
    expect(proseRoots).toHaveLength(1)
    expect(proseRoots[0]).toBe(documentRoot)
    expect(documentRoot.className).toContain("text-xl")
    expect(documentRoot.className).toContain("text-text-interactive-base")
  })

  test("retains every projected block DOM node when streaming completes", async () => {
    const text = "Stable paragraph.\n\nFinal paragraph."

    await act(async () => {
      root.render(<MarkdownHtmlSegment text={text} cacheKey="terminal-projection" streaming />)
      await flushEffects()
    })

    const streamingBlocks = Array.from(container.querySelectorAll("[data-markdown-block-key]"))
    expect(streamingBlocks).toHaveLength(2)
    const stableBlock = streamingBlocks[0]
    const tailBlock = streamingBlocks[1]

    await act(async () => {
      root.render(<MarkdownHtmlSegment text={text} cacheKey="terminal-projection" />)
      await flushEffects()
    })

    const completedBlocks = Array.from(container.querySelectorAll("[data-markdown-block-key]"))
    expect(completedBlocks).toHaveLength(2)
    expect(completedBlocks[0]).toBe(stableBlock)
    expect(completedBlocks[1]).toBe(tailBlock)
    expect(container.textContent).toContain("Final paragraph.")
  })

  test("reuses rendered Markdown when interruption metadata changes", async () => {
    const text = "Rendered content remains stable."

    await act(async () => {
      root.render(<MarkdownHtmlSegment text={text} cacheKey="interruption-cache" streaming />)
      await flushUntil(
        () =>
          container
            .querySelector("[data-markdown-block-key]")
            ?.getAttribute("data-markdown-parse-state") === "ready",
      )
    })

    const block = container.querySelector("[data-markdown-block-key]")
    expect(block?.getAttribute("data-markdown-parse-state")).toBe("ready")

    await act(async () => {
      root.render(
        <MarkdownHtmlSegment text={text} cacheKey="interruption-cache" streaming interrupted />,
      )
      await flushEffects()
    })

    expect(container.querySelector("[data-markdown-block-key]")).toBe(block)
    expect(block?.getAttribute("data-markdown-parse-state")).toBe("cached")
    expect(block?.getAttribute("data-markdown-parse-duration-ms")).toBeNull()
  })

  test("preserves a broken image node while its live Markdown block grows", async () => {
    const initial = "Image: ![alt text](https://invalid.example/missing.png) inline"

    await act(async () => {
      root.render(
        <MarkdownHtmlSegment text={initial} cacheKey="streaming-broken-image" streaming />,
      )
      await flushUntil(() => container.querySelector("img") !== null)
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    image?.dispatchEvent(new Event("error"))

    act(() => {
      root.render(
        <MarkdownHtmlSegment
          text={`${initial} text keeps growing`}
          cacheKey="streaming-broken-image"
          streaming
        />,
      )
    })

    expect(container.querySelector("img")).toBe(image)

    await act(async () => {
      await flushUntil(() => container.textContent?.includes("text keeps growing") ?? false)
    })

    expect(container.querySelector("img")).toBe(image)
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("alt text")
  })

  test("reserves broken image space and restores known image dimensions on remount", async () => {
    const text = [
      "![ready](https://assets.example/known.png)",
      "",
      "![missing](https://assets.example/missing.png)",
    ].join("\n")

    await act(async () => {
      root.render(<MarkdownHtmlSegment text={text} cacheKey="remounted-images" />)
      await flushUntil(() => container.querySelectorAll("img").length === 2)
    })

    const initialImages = container.querySelectorAll<HTMLImageElement>("img")
    const readyImage = initialImages[0]
    const missingImage = initialImages[1]
    if (!readyImage || !missingImage) {
      throw new Error("Expected both Markdown images to render")
    }
    Object.defineProperties(readyImage, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 640 },
      naturalHeight: { configurable: true, value: 360 },
    })
    readyImage.dispatchEvent(new Event("load"))
    missingImage.dispatchEvent(new Event("error"))

    expect(readyImage.dataset.markdownImageState).toBe("ready")
    expect(missingImage.dataset.markdownImageState).toBe("error")
    expect(missingImage.style.minHeight).toBe("1.5rem")

    await act(async () => {
      root.render(<div />)
      await flushEffects()
      root.render(<MarkdownHtmlSegment text={text} cacheKey="remounted-images" />)
      await flushUntil(() => container.querySelectorAll("img").length === 2)
    })

    const remountedImages = container.querySelectorAll<HTMLImageElement>("img")
    expect(remountedImages[0]?.getAttribute("width")).toBe("640")
    expect(remountedImages[0]?.getAttribute("height")).toBe("360")
    expect(remountedImages[1]?.style.minHeight).toBe("1.5rem")
  })

  test("preserves authored image dimensions after load and remount", async () => {
    const text =
      '<img src="https://assets.example/authored-size.png" alt="authored" width="100" height="50">'

    await act(async () => {
      root.render(<MarkdownHtmlSegment text={text} cacheKey="authored-image-size" />)
      await flushUntil(() => container.querySelector("img") !== null)
    })

    const image = container.querySelector<HTMLImageElement>("img")
    if (!image) throw new Error("Expected the authored Markdown image to render")
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 640 },
      naturalHeight: { configurable: true, value: 360 },
    })
    image.dispatchEvent(new Event("load"))

    expect(image.getAttribute("width")).toBe("100")
    expect(image.getAttribute("height")).toBe("50")

    await act(async () => {
      root.render(<div />)
      await flushEffects()
      root.render(<MarkdownHtmlSegment text={text} cacheKey="authored-image-size" />)
      await flushUntil(() => container.querySelector("img") !== null)
    })

    const remountedImage = container.querySelector<HTMLImageElement>("img")
    expect(remountedImage?.getAttribute("width")).toBe("100")
    expect(remountedImage?.getAttribute("height")).toBe("50")
  })

  test("derives a missing authored image axis from its intrinsic aspect ratio", async () => {
    const text = [
      '<img src="https://assets.example/width-only.png" alt="width only" width="100">',
      "",
      '<img src="https://assets.example/height-only.png" alt="height only" height="50">',
    ].join("\n")

    await act(async () => {
      root.render(<MarkdownHtmlSegment text={text} cacheKey="single-axis-image-size" />)
      await flushUntil(() => container.querySelectorAll("img").length === 2)
    })

    const [widthOnlyImage, heightOnlyImage] = Array.from(
      container.querySelectorAll<HTMLImageElement>("img"),
    )
    if (!widthOnlyImage || !heightOnlyImage) {
      throw new Error("Expected both single-axis Markdown images to render")
    }
    for (const image of [widthOnlyImage, heightOnlyImage]) {
      Object.defineProperties(image, {
        complete: { configurable: true, value: true },
        naturalWidth: { configurable: true, value: 640 },
        naturalHeight: { configurable: true, value: 360 },
      })
      image.dispatchEvent(new Event("load"))
    }

    expect(widthOnlyImage.getAttribute("width")).toBe("100")
    expect(widthOnlyImage.getAttribute("height")).toBe("56")
    expect(heightOnlyImage.getAttribute("width")).toBe("89")
    expect(heightOnlyImage.getAttribute("height")).toBe("50")

    await act(async () => {
      root.render(<div />)
      await flushEffects()
      root.render(<MarkdownHtmlSegment text={text} cacheKey="single-axis-image-size" />)
      await flushUntil(() => container.querySelectorAll("img").length === 2)
    })

    const remountedImages = container.querySelectorAll<HTMLImageElement>("img")
    expect(remountedImages[0]?.getAttribute("width")).toBe("100")
    expect(remountedImages[0]?.getAttribute("height")).toBe("56")
    expect(remountedImages[1]?.getAttribute("width")).toBe("89")
    expect(remountedImages[1]?.getAttribute("height")).toBe("50")
  })

  test("does not wait for the worker to render final non-code markdown", async () => {
    const originalWorker = globalThis.Worker

    class HangingWorker extends EventTarget {
      onerror: ((this: AbstractWorker, event: ErrorEvent) => void) | null = null
      onmessage: ((this: Worker, event: MessageEvent) => void) | null = null
      onmessageerror: ((this: Worker, event: MessageEvent) => void) | null = null

      constructor(_url: string | URL, _options?: WorkerOptions) {
        super()
      }

      postMessage(
        _message: THighlightWorkerMessage,
        _options?: StructuredSerializeOptions | Transferable[],
      ): void {}
      terminate(): void {}
    }

    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: HangingWorker,
    })

    try {
      await act(async () => {
        root.render(
          <MarkdownHtmlSegment
            text={String.raw`**Vector Cross Product:**

$$\mathb{a} \times \mathbf{b} = \begin{vmatrix} \mathbf{i} & \mathbf{j} & \mathbf{k} \\ a_1 & a_2 & a_3 \\ b_1 & b_2 & b_3 \end{vmatrix}$$`}
            cacheKey="final-non-code-hanging-worker"
          />,
        )
        await flushEffects()
      })

      expect(container.querySelector("strong")?.textContent).toBe("Vector Cross Product:")
      expect(container.innerHTML).toContain("katex-display")
      expect(container.textContent).not.toContain("**Vector Cross Product:**")
    } finally {
      if (originalWorker) {
        Object.defineProperty(globalThis, "Worker", {
          configurable: true,
          value: originalWorker,
        })
      } else {
        Reflect.deleteProperty(globalThis, "Worker")
      }
    }
  })

  test("keeps raw streaming code visible when Worker is unavailable", async () => {
    const originalWorker = globalThis.Worker
    resetMarkdownWorkerForTests()
    Reflect.deleteProperty(globalThis, "Worker")

    try {
      await act(async () => {
        root.render(
          <MarkdownHtmlSegment
            text={"```ts\nconst unavailableWorker = true"}
            cacheKey="worker-unavailable-code"
            streaming
          />,
        )
        await flushEffects()
      })

      expect(container.querySelector("pre code")?.textContent).toContain(
        "const unavailableWorker = true",
      )
    } finally {
      resetMarkdownWorkerForTests()
      if (originalWorker) {
        Object.defineProperty(globalThis, "Worker", {
          configurable: true,
          value: originalWorker,
        })
      }
    }
  })

  test("keeps raw streaming code visible when Worker construction throws", async () => {
    const originalWorker = globalThis.Worker
    resetMarkdownWorkerForTests()

    class ThrowingWorker {
      constructor(_url: string | URL, _options?: WorkerOptions) {
        throw new Error("Worker startup blocked")
      }

      terminate(): void {}
    }

    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: ThrowingWorker,
    })

    try {
      await act(async () => {
        root.render(
          <MarkdownHtmlSegment
            text={"```ts\nconst blockedWorker = true"}
            cacheKey="worker-blocked-code"
            streaming
          />,
        )
        await flushEffects()
      })

      expect(container.querySelector("pre code")?.textContent).toContain(
        "const blockedWorker = true",
      )
    } finally {
      resetMarkdownWorkerForTests()
      if (originalWorker) {
        Object.defineProperty(globalThis, "Worker", {
          configurable: true,
          value: originalWorker,
        })
      } else {
        Reflect.deleteProperty(globalThis, "Worker")
      }
    }
  })

  test("patches only the code token tail and keeps completed code mounted at terminal", async () => {
    const originalWorker = globalThis.Worker
    const requests: TBuddyConfigValue[] = []

    class TokenWorker extends EventTarget {
      onerror: ((this: AbstractWorker, event: ErrorEvent) => void) | null = null
      onmessage: ((this: Worker, event: MessageEvent) => void) | null = null
      onmessageerror: ((this: Worker, event: MessageEvent) => void) | null = null

      constructor(_url: string | URL, _options?: WorkerOptions) {
        super()
      }

      postMessage(
        message: THighlightWorkerMessage,
        _options?: StructuredSerializeOptions | Transferable[],
      ): void {
        requests.push(parseBuddyConfigObject(message) ?? {})
        const parsed = parseHighlightWorkerMessage(message)
        if (parsed?.type !== "highlight") return
        if (parsed.id === undefined || parsed.key === undefined || parsed.text === undefined) return

        const complete = parsed.complete === true
        const response = complete
          ? {
              type: "highlight" as const,
              id: parsed.id,
              key: parsed.key,
              reset: true,
              stable: [["const x = 1", "color: purple"] as const],
              unstable: [],
            }
          : parsed.text === "const x"
            ? {
                type: "highlight" as const,
                id: parsed.id,
                key: parsed.key,
                reset: true,
                stable: [["const ", "color: blue"] as const],
                unstable: [["x", "color: red"] as const],
              }
            : {
                type: "highlight" as const,
                id: parsed.id,
                key: parsed.key,
                reset: false,
                stable: [["x", "color: red"] as const],
                unstable: [[" = 1", "color: green"] as const],
              }
        queueMicrotask(() => {
          this.dispatchEvent(new MessageEvent("message", { data: response }))
        })
      }

      terminate(): void {}
    }

    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: TokenWorker,
    })

    try {
      await act(async () => {
        root.render(
          <MarkdownHtmlSegment text={"```ts\nconst x"} cacheKey="streaming-code" streaming />,
        )
        await flushEffects()
      })

      const firstTokens = container.querySelectorAll("pre code > span")
      expect(firstTokens).toHaveLength(2)
      const stableToken = firstTokens[0]
      const promotedToken = firstTokens[1]
      const initialPre = container.querySelector<HTMLPreElement>("pre.shiki.OpenCode")
      expect(initialPre?.style.backgroundColor).toBe("var(--color-background-stronger)")
      expect(initialPre?.style.color).toBe("var(--color-text-base)")

      await act(async () => {
        root.render(
          <MarkdownHtmlSegment text={"```ts\nconst x = 1"} cacheKey="streaming-code" streaming />,
        )
        await flushEffects()
      })

      const nextTokens = container.querySelectorAll("pre code > span")
      expect(nextTokens).toHaveLength(3)
      expect(nextTokens[0]).toBe(stableToken)
      expect(nextTokens[1]).toBe(promotedToken)
      expect(container.textContent).toContain("const x = 1")

      await act(async () => {
        root.render(
          <MarkdownHtmlSegment
            text={"```ts\nconst x = 1\n```"}
            cacheKey="streaming-code"
            streaming
          />,
        )
        await flushEffects()
      })

      expect(
        requests.some((request) => {
          const parsed = parseHighlightWorkerMessage(request)
          return parsed?.type === "highlight" && parsed.complete === true
        }),
      ).toBe(true)
      const completedCodeBlock = container.querySelector(
        '[data-markdown-block-key="streaming-code:block:0"]',
      )
      expect(completedCodeBlock).not.toBeNull()

      await act(async () => {
        root.render(
          <MarkdownHtmlSegment text={"```ts\nconst x = 1\n```"} cacheKey="streaming-code" />,
        )
        await flushEffects()
      })
      await act(async () => {
        await flushUntil(
          () =>
            container.querySelector(
              '[data-markdown-block-key="streaming-code:block:0"] pre.shiki.OpenCode',
            ) !== null,
        )
      })

      expect(container.querySelector('[data-markdown-block-key="streaming-code:block:0"]')).toBe(
        completedCodeBlock,
      )
      expect(
        container.querySelector(
          '[data-markdown-block-key="streaming-code:block:0"] pre.shiki.OpenCode',
        ),
      ).not.toBeNull()
      expect(container.textContent).toContain("const x = 1")
    } finally {
      if (originalWorker) {
        Object.defineProperty(globalThis, "Worker", {
          configurable: true,
          value: originalWorker,
        })
      } else {
        Reflect.deleteProperty(globalThis, "Worker")
      }
    }
  })
})
