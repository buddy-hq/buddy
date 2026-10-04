import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createQueryTestRoot } from "./query-test-root"
import { ExternalFileOpenDialog } from "../src/components/files/external-file-open-dialog"
import { MarkdownHtmlSegment } from "../src/components/markdown/markdown-html-segment"
import { resetMarkdownWorkerForTests } from "../src/components/markdown/markdown-worker"
import {
  getPlatform,
  PlatformProvider,
  setRuntimePlatform,
  type Platform,
} from "../src/context/platform"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import { useExternalFileOpenDialogStore } from "../src/state/external-file-open-dialog-store"

const originalFetch = globalThis.fetch
const originalPlatform = getPlatform()

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
    root = createQueryTestRoot(container)
  })

  afterEach(async () => {
    useExternalFileOpenDialogStore.getState().resolveRequest("cancel")
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    globalThis.fetch = originalFetch
    setRuntimePlatform(originalPlatform)
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
    const favicon = link?.querySelector('[data-slot="link-favicon"]')
    const faviconImg = favicon?.querySelector("img")
    expect(faviconImg?.getAttribute("src")).toBe(
      "https://www.google.com/s2/favicons?domain=developer.mozilla.org&sz=32",
    )
    expect(faviconImg?.classList.contains("m-0")).toBe(true)
    expect(favicon?.classList.contains("align-middle")).toBe(true)
    expect(favicon?.classList.contains("leading-none")).toBe(true)
    expect(link?.textContent).toBe("MDN Web Docs")
  })

  test("uses the GitHub mark for GitHub links", async () => {
    await renderMarkdown("[Buddy](https://github.com/buddy-hq/buddy)")

    const favicon = container.querySelector('a.external-link [data-slot="link-favicon"]')
    expect(favicon?.querySelector("svg")).not.toBeNull()
    expect(favicon?.querySelector("img")).toBeNull()
  })

  test("keeps private website links on the globe without a public-provider request", async () => {
    for (const url of [
      "http://localhost:3000/private",
      "http://192.168.1.10/account",
      "http://[::1]/private",
      "https://notebook.internal/page",
    ]) {
      await renderMarkdown(`[Private page](${url})`)
      const link = container.querySelector("a.external-link")
      expect(link?.getAttribute("href")).toBe(url)
      expect(link?.textContent).toBe("Private page")
      const favicon = link?.querySelector('[data-slot="link-favicon"]')
      expect(favicon?.querySelector("img")).toBeNull()
      expect(favicon?.querySelector("svg")).not.toBeNull()
    }
  })

  test("leaves raw non-website external anchors undecorated", async () => {
    await renderMarkdown('<a class="external-link" href="mailto:help@example.com">Email</a>')
    const link = container.querySelector("a.external-link")
    expect(link?.getAttribute("href")).toBe("mailto:help@example.com")
    expect(link?.textContent).toBe("Email")
    expect(link?.querySelector('[data-slot="link-favicon"]')).toBeNull()
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

  test("renders a plain external file path as a file chip", async () => {
    await renderMarkdown("/Users/example/Desktop/states-of-matter-session.pdf")

    const link = container.querySelector("a.presented-media-link")
    expect(link?.getAttribute("data-presented-media-path")).toBe(
      "/Users/example/Desktop/states-of-matter-session.pdf",
    )
    expect(link?.textContent).toBe("states-of-matter-session.pdf")
  })

  test("keeps an inline-code file path as code while chipping plain paths", async () => {
    await renderMarkdown(
      "`/Users/example/Desktop/graph1_sine.png` /Users/example/Desktop/graph1_sine.png",
    )

    expect(container.querySelector("code")?.textContent).toBe(
      "/Users/example/Desktop/graph1_sine.png",
    )
    expect(container.querySelector("code a")).toBeNull()
    expect(container.querySelectorAll("a.presented-media-link")).toHaveLength(1)
  })

  test("keeps units written with a slash as plain text", async () => {
    const message = [
      "Exactly — 99% at or under 28. You got it.",
      "",
      "Tiny polish: it's 99 orders at or under 28 *including* the p99 guy himself, plus 1 unlucky order above him at 58. But your logic is spot on.",
      "",
      "Going harder — flipping the metric on you:",
      "",
      "**Level 3 - new metric, full context:**",
      "",
      "We measured 200 LLM calls, sorted by *generation speed* slowest → fastest, in tokens/s (higher = faster).",
      "",
      "p50 = 17.88 tokens/s, p99 = 30.01 tokens/s, max = 32.98 tokens/s.",
      "",
      "What does that p99 = 30.01 tell you about the 200 calls? And why is *higher* better here, when *lower* was better for Swiggy?",
    ].join("\n")

    await renderMarkdown(message)

    expect(
      Array.from(container.querySelectorAll("a.presented-media-link"), (link) =>
        link.getAttribute("data-presented-media-path"),
      ),
    ).toEqual([])
    expect(container.textContent).toContain(
      "p50 = 17.88 tokens/s, p99 = 30.01 tokens/s, max = 32.98 tokens/s.",
    )
  })

  test("chips a real path that follows a unit written with a slash", async () => {
    await renderMarkdown(
      "p50 = 17.88 tokens/s, max = 32.98 tokens/s.\n\nSaved to /Users/example/Desktop/report.pdf",
    )

    const links = container.querySelectorAll("a.presented-media-link")
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute("data-presented-media-path")).toBe(
      "/Users/example/Desktop/report.pdf",
    )
    expect(container.textContent).toContain("p50 = 17.88 tokens/s, max = 32.98 tokens/s.")
  })

  test("keeps slash clauses intact while chipping later paths in the same paragraph", async () => {
    const text = [
      "tokens/s, see README.md; token/s; see README.md; MB/s and README.md;",
      "50 tokens/s. see README.md; req/s, max = 32.98ms; ratio 1/2, report.csv.",
      "50 tokens/s, see docs/report.pdf; units MB/s; artifact ./report.csv.",
    ].join(" ")

    await renderMarkdown(text)

    expect(
      Array.from(container.querySelectorAll("a.presented-media-link"), (link) =>
        link.getAttribute("data-presented-media-path"),
      ),
    ).toEqual(["docs/report.pdf", "./report.csv"])
    expect(container.textContent).toContain(
      "tokens/s, see README.md; token/s; see README.md; MB/s and README.md;",
    )
    expect(container.textContent).toContain(
      "50 tokens/s. see README.md; req/s, max = 32.98ms; ratio 1/2, report.csv.",
    )
  })

  test("keeps spaced relative filenames when file intent is explicit", async () => {
    await renderMarkdown(
      "Open ./generated/Command R+ Blog Header.png and [the book](<generated/Mark Richards; Neal Ford.pdf>).",
    )

    expect(
      Array.from(container.querySelectorAll("a.presented-media-link"), (link) =>
        link.getAttribute("data-presented-media-path"),
      ),
    ).toEqual(["./generated/Command R+ Blog Header.png", "generated/Mark Richards; Neal Ford.pdf"])
  })

  test("uses the theme-colored Markdown icon on file chips", async () => {
    await renderMarkdown("[Frames](~/Desktop/frames.md)")

    const icon = container.querySelector('[data-slot="presented-media-icon"] svg')
    expect(icon?.classList.contains("text-icon-info-base")).toBe(true)
    expect(container.querySelector('[data-slot="presented-media-icon"] img')).toBeNull()
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

  test("explains a missing outside file and reveals its containing folder", async () => {
    const revealedPaths: Array<{ directory: string; path: string }> = []
    const platform: Platform = {
      platform: "desktop",
      os: "macos",
      openLink() {},
      async revealContainingFolder(directory, path) {
        revealedPaths.push({ directory, path })
      },
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    }
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString()
        expect(url).toContain("/api/objects/media-presentation/files/resolve")
        return Response.json({ error: "File not found" }, { status: 404 })
      }),
      originalFetch,
    )

    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <MarkdownHtmlSegment
            text="[report](/tmp/missing-report.pdf)"
            directory="/repo"
            cacheKey="missing-outside-report"
          />
          <ExternalFileOpenDialog />
        </PlatformProvider>,
      )
      await flushEffects()
    })

    await act(async () => {
      container.querySelector<HTMLAnchorElement>("a.presented-media-link")?.click()
      await flushEffects()
    })

    expect(useExternalFileOpenDialogStore.getState().request).toMatchObject({
      kind: "missing",
      path: "/tmp/missing-report.pdf",
      outsideNotebook: true,
      canShowFolder: true,
    })
    const dialog = document.querySelector('[role="alertdialog"]')
    expect(dialog?.textContent).toContain("File outside this notebook not found")
    expect(dialog?.textContent).toContain("/tmp/missing-report.pdf")
    expect(dialog?.textContent).toContain("Copy path")

    const showFolder = Array.from(dialog?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("Reveal in Finder"),
    )
    await act(async () => {
      showFolder?.click()
      await flushEffects()
    })
    expect(revealedPaths).toEqual([{ directory: "/repo", path: "/tmp/missing-report.pdf" }])
  })

  test("offers folder reveal for missing home and file URL paths", async () => {
    const revealedPaths: string[] = []
    const platform: Platform = {
      platform: "desktop",
      os: "macos",
      openLink() {},
      async revealContainingFolder(_directory, path) {
        revealedPaths.push(path)
      },
      async restart() {},
      back() {},
      forward() {},
      async notify() {},
    }
    globalThis.fetch = withFetchPreconnect(
      mock(async () => Response.json({ error: "File not found" }, { status: 404 })),
      originalFetch,
    )

    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <MarkdownHtmlSegment
            text={"file:///tmp/missing.pdf\n~/Downloads/missing.pdf"}
            directory="/repo"
            cacheKey="missing-external-formats"
          />
          <ExternalFileOpenDialog />
        </PlatformProvider>,
      )
      await flushEffects()
    })

    const links = container.querySelectorAll<HTMLAnchorElement>("a.presented-media-link")
    expect(links.length).toBe(2)
    for (const link of links) {
      await act(async () => {
        link.click()
        await flushEffects()
      })
      const dialog = document.querySelector('[role="alertdialog"]')
      const showFolder = Array.from(dialog?.querySelectorAll("button") ?? []).find((button) =>
        button.textContent?.includes("Reveal in Finder"),
      )
      expect(showFolder).toBeDefined()
      await act(async () => {
        showFolder?.click()
        await flushEffects()
      })
    }
    expect(revealedPaths).toEqual(["file:///tmp/missing.pdf", "~/Downloads/missing.pdf"])
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
    await renderMarkdown("[Retry one](https://retry.example.com/one)")
    const image = container.querySelector('[data-slot="link-favicon"] img')
    expect(image?.getAttribute("src")).toBe(
      "https://www.google.com/s2/favicons?domain=retry.example.com&sz=32",
    )
    image?.dispatchEvent(new Event("error"))
    expect(container.querySelector('[data-slot="link-favicon"] svg')).not.toBeNull()

    await renderMarkdown("[Retry two](https://retry.example.com/two)")
    expect(container.querySelector('[data-slot="link-favicon"] img')).toBeNull()

    setSystemTime(new Date(Date.now() + 11 * 60 * 1000))
    try {
      await renderMarkdown("[Retry three](https://retry.example.com/three)")
      expect(container.querySelector('[data-slot="link-favicon"] img')).not.toBeNull()
    } finally {
      setSystemTime()
    }
  })
})
