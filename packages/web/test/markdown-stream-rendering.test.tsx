import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MarkdownHtmlSegment } from "../src/components/markdown/markdown-html-segment"
import { resetMarkdownWorkerForTests } from "../src/components/markdown/markdown-worker"

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

    const stableBlock = container.querySelector('[data-markdown-block-key="stream:0:full"]')
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

    expect(container.querySelector('[data-markdown-block-key="stream:0:full"]')).toBe(stableBlock)
    expect(container.textContent).toContain("First tail grows")
  })

  test("preserves a broken image node while its live Markdown block grows", async () => {
    const initial = "Image: ![alt text](https://invalid.example/missing.png) inline"

    await act(async () => {
      root.render(
        <MarkdownHtmlSegment
          text={initial}
          cacheKey="streaming-broken-image"
          streaming
        />,
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

  test("does not wait for the worker to render final non-code markdown", async () => {
    const originalWorker = globalThis.Worker

    class HangingWorker extends EventTarget implements Worker {
      onerror: ((this: AbstractWorker, event: ErrorEvent) => unknown) | null = null
      onmessage: ((this: Worker, event: MessageEvent) => unknown) | null = null
      onmessageerror: ((this: Worker, event: MessageEvent) => unknown) | null = null

      constructor(_url: string | URL, _options?: WorkerOptions) {
        super()
      }

      postMessage(_message: unknown, _options?: StructuredSerializeOptions | Transferable[]): void {}
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

  test("patches only the code token tail and disposes highlighting when streaming stops", async () => {
    const originalWorker = globalThis.Worker
    const requests: unknown[] = []

    class TokenWorker extends EventTarget implements Worker {
      onerror: ((this: AbstractWorker, event: ErrorEvent) => unknown) | null = null
      onmessage: ((this: Worker, event: MessageEvent) => unknown) | null = null
      onmessageerror: ((this: Worker, event: MessageEvent) => unknown) | null = null

      constructor(_url: string | URL, _options?: WorkerOptions) {
        super()
      }

      postMessage(message: unknown, _options?: StructuredSerializeOptions | Transferable[]): void {
        requests.push(message)
        if (!message || typeof message !== "object" || !("type" in message)) return
        if (message.type !== "highlight") return
        if (!("id" in message) || typeof message.id !== "number") return
        if (!("key" in message) || typeof message.key !== "string") return
        if (!("text" in message) || typeof message.text !== "string") return

        const complete =
          "complete" in message && typeof message.complete === "boolean" && message.complete
        const response = complete
          ? {
              type: "highlight" as const,
              id: message.id,
              key: message.key,
              reset: true,
              stable: [["const x = 1", "color: purple"] as [string, string]],
              unstable: [],
            }
          : message.text === "const x"
            ? {
                type: "highlight" as const,
                id: message.id,
                key: message.key,
                reset: true,
                stable: [["const ", "color: blue"] as [string, string]],
                unstable: [["x", "color: red"] as [string, string]],
              }
            : {
                type: "highlight" as const,
                id: message.id,
                key: message.key,
                reset: false,
                stable: [["x", "color: red"] as [string, string]],
                unstable: [[" = 1", "color: green"] as [string, string]],
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
          <MarkdownHtmlSegment
            text={"```ts\nconst x"}
            cacheKey="streaming-code"
            streaming
          />,
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
          <MarkdownHtmlSegment
            text={"```ts\nconst x = 1"}
            cacheKey="streaming-code"
            streaming
          />,
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
        requests.some(
          (request) =>
            !!request &&
            typeof request === "object" &&
            "type" in request &&
            request.type === "highlight" &&
            "complete" in request &&
            request.complete === true,
        ),
      ).toBe(true)

      await act(async () => {
        root.render(
          <MarkdownHtmlSegment
            text={"```ts\nconst x = 1\n```"}
            cacheKey="streaming-code"
          />,
        )
        await flushEffects()
      })
      await act(async () => {
        await flushUntil(
          () =>
            container.querySelector(
              '[data-markdown-block-key="streaming-code:0:full"] pre.shiki.OpenCode',
            ) !== null,
        )
      })

      expect(
        requests.some(
          (request) =>
            !!request &&
            typeof request === "object" &&
            "type" in request &&
            request.type === "dispose",
        ),
      ).toBe(true)
      expect(
        container.querySelector(
          '[data-markdown-block-key="streaming-code:0:full"] pre.shiki.OpenCode',
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
