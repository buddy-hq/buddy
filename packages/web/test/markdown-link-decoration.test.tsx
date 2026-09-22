import "../happydom"
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MarkdownHtmlSegment } from "../src/components/markdown/markdown-html-segment"
import { resetMarkdownWorkerForTests } from "../src/components/markdown/markdown-worker"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe("markdown link decoration", () => {
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

  async function renderMarkdown(text: string) {
    await act(async () => {
      root.render(<MarkdownHtmlSegment text={text} cacheKey={text} />)
      await flushEffects()
    })
  }

  test("puts the site favicon before a web link", async () => {
    await renderMarkdown("[MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web)")

    const link = container.querySelector("a.external-link")
    expect(link?.querySelector('[data-slot="link-favicon"] img')?.getAttribute("src")).toBe(
      "https://developer.mozilla.org/favicon.ico",
    )
    expect(link?.textContent).toBe("MDN Web Docs")
  })

  test("uses the GitHub mark for GitHub links", async () => {
    await renderMarkdown("[Buddy](https://github.com/buddy-hq/buddy)")

    const favicon = container.querySelector('a.external-link [data-slot="link-favicon"]')
    expect(favicon?.querySelector("svg")).not.toBeNull()
    expect(favicon?.querySelector("img")).toBeNull()
  })

  test("keeps a link that wraps inline code", async () => {
    await renderMarkdown(
      "[`Array.prototype.map()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript)",
    )

    const link = container.querySelector("a.external-link")
    expect(link?.querySelector("code")?.textContent).toBe("Array.prototype.map()")
    expect(link?.querySelector('[data-slot="link-favicon"]')).not.toBeNull()
  })

  test("leaves image-only links without a favicon", async () => {
    await renderMarkdown(
      "[![Build](https://img.shields.io/badge/build-passing-green.svg)](https://github.com/buddy-hq/buddy)",
    )

    expect(container.querySelector("a.external-link")).not.toBeNull()
    expect(container.querySelector('[data-slot="link-favicon"]')).toBeNull()
  })

  test("renders local file links as file chips", async () => {
    await renderMarkdown("[package.json#L5-L15](file:///Users/example/buddy/package.json#L5-L15)")

    const link = container.querySelector("a.presented-media-link")
    expect(link?.getAttribute("data-presented-media-path")).toBe(
      "/Users/example/buddy/package.json",
    )
    expect(link?.textContent).toBe("package.json")
  })

  test("renders workspace-relative file links as file chips", async () => {
    await renderMarkdown("[the notes](./artifacts/notes.md)")

    const link = container.querySelector("a.presented-media-link")
    expect(link?.getAttribute("data-presented-media-path")).toBe("./artifacts/notes.md")
    expect(link?.textContent).toBe("notes.md")
  })

  test("shows decoded file names on file chips", async () => {
    await renderMarkdown("[My Notes](./My%20Notes.md)")

    const link = container.querySelector("a.presented-media-link")
    expect(link?.getAttribute("data-presented-media-path")).toBe("./My Notes.md")
    expect(link?.textContent).toBe("My Notes.md")
  })

  test("renders Windows drive links as file chips", async () => {
    await renderMarkdown("[report](C:\\Users\\example\\report.pdf)")

    const link = container.querySelector("a.presented-media-link")
    expect(link?.getAttribute("data-presented-media-path")).toBe("C:/Users/example/report.pdf")
    expect(link?.textContent).toBe("report.pdf")
  })

  test("keeps images inside local file links", async () => {
    await renderMarkdown(
      "[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE.md)",
    )

    expect(container.querySelector("a img")).not.toBeNull()
    expect(container.querySelector("a.presented-media-link")).toBeNull()
  })

  test("keeps web links to files as web links", async () => {
    await renderMarkdown('<a href="https://arxiv.org/pdf/2401.00001.pdf">paper</a>')

    expect(container.querySelector("a.presented-media-link")).toBeNull()
    expect(container.querySelector("a")?.textContent).toBe("paper")
  })

  test("lets link text that starts with code wrap", async () => {
    await renderMarkdown(
      "[`packages/web/src/components/markdown/markdown-html-segment.tsx`](https://example.com/source)",
    )

    const link = container.querySelector<HTMLAnchorElement>("a.external-link")
    expect(link?.querySelector(".whitespace-nowrap")).toBeNull()
    expect(link?.querySelector("code")?.parentElement).toBe(link)
    expect(link?.firstElementChild?.getAttribute("data-slot")).toBe("link-favicon")
  })

  test("keeps a leading emoji whole next to the favicon", async () => {
    await renderMarkdown("[🚀 Launch notes](https://example.com/launch)")

    const link = container.querySelector("a.external-link")
    expect(link?.querySelector(".whitespace-nowrap")?.textContent).toBe("🚀")
    expect(link?.textContent).toBe("🚀 Launch notes")
  })

  test("retries a failed favicon after a while", async () => {
    await renderMarkdown("[Retry one](https://retry.example/one)")
    const image = container.querySelector('[data-slot="link-favicon"] img')
    image?.dispatchEvent(new Event("error"))
    expect(container.querySelector('[data-slot="link-favicon"] svg')).not.toBeNull()

    await renderMarkdown("[Retry two](https://retry.example/two)")
    expect(container.querySelector('[data-slot="link-favicon"] img')).toBeNull()

    setSystemTime(new Date(Date.now() + 11 * 60 * 1000))
    try {
      await renderMarkdown("[Retry three](https://retry.example/three)")
      expect(container.querySelector('[data-slot="link-favicon"] img')).not.toBeNull()
    } finally {
      setSystemTime()
    }
  })
})
