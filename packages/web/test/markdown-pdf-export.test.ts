import { afterEach, describe, expect, test } from "bun:test"
import {
  serializeMarkdownPdfDocument,
  waitForMarkdownPdfRenderReady,
} from "../src/lib/markdown-pdf-export"

describe("Markdown PDF export", () => {
  afterEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
    document.documentElement.removeAttribute("class")
    document.documentElement.removeAttribute("data-theme")
    document.documentElement.removeAttribute("dir")
    document.documentElement.removeAttribute("lang")
    document.documentElement.removeAttribute("style")
  })

  test("serializes rendered content and removes interactive controls", () => {
    document.documentElement.className = "theme-light"
    document.documentElement.lang = "en"
    document.documentElement.dir = "ltr"
    document.documentElement.dataset.theme = "paper"
    document.documentElement.style.colorScheme = "light"
    document.body.className = "font-sans"
    document.head.innerHTML = '<style id="app-styles">.prose { color: black; }</style>'

    const root = document.createElement("article")
    root.className = "prose"
    root.innerHTML = `
      <h1>Worksheet &amp; notes</h1>
      <button type="button">Copy</button>
      <div data-markdown-export-ignore>Toolbar</div>
      <svg viewBox="0 0 10 10"><path d="M0 0h10v10z"></path></svg>
    `
    document.body.append(root)

    const html = serializeMarkdownPdfDocument({
      title: 'Lesson "One"',
      element: root,
    })

    expect(html).toContain("<title>Lesson &quot;One&quot;</title>")
    expect(html).toContain('lang="en"')
    expect(html).toContain('dir="ltr"')
    expect(html).toContain("data-markdown-pdf-document")
    expect(html).not.toContain('class="theme-light"')
    expect(html).not.toContain('data-theme="paper"')
    expect(html).not.toContain('style="color-scheme: light;"')
    expect(html).not.toContain('class="font-sans"')
    expect(html).toContain('id="app-styles"')
    expect(html).toContain("Worksheet &amp; notes")
    expect(html).toContain("<svg")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("Toolbar")

    root.remove()
  })

  test("exports with a light paginated print stylesheet instead of app theme chrome", () => {
    document.documentElement.className = "dark"
    document.documentElement.dataset.theme = "night"
    document.documentElement.style.colorScheme = "dark"
    document.body.className = "bg-background-base text-text-base overflow-hidden"
    document.head.innerHTML = `
      <style>
        .dark {
          --background-base: #020617;
          --text-base: #f8fafc;
          --color-text-base: var(--text-base);
        }
        .bg-background-base { background: var(--background-base); }
        .text-text-base { color: var(--text-base); }
        .overflow-hidden { overflow: hidden; }
      </style>
    `

    const root = document.createElement("article")
    root.className = "bg-background-base text-text-base max-w-4xl px-8 py-10"
    root.innerHTML = "<h1>Printable worksheet</h1><p>Long content should paginate.</p>"
    document.body.append(root)

    const html = serializeMarkdownPdfDocument({
      title: "Printable",
      element: root,
    })

    expect(html).toContain("size: letter;")
    expect(html).toContain("background: #ffffff !important;")
    expect(html).toContain("height: auto !important;")
    expect(html).toContain("overflow: visible !important;")
    expect(html).toContain("color-scheme: light !important;")
    expect(html).not.toContain('class="dark"')
    expect(html).not.toContain('data-theme="night"')
    expect(html).not.toContain('class="bg-background-base text-text-base overflow-hidden"')
  })

  test("serializes stylesheet links with absolute hrefs", () => {
    document.head.innerHTML =
      '<base href="https://buddy.test/app/"><link rel="stylesheet" href="/assets/app.css" data-buddy-style="app">'
    const link = document.head.querySelector("link")
    if (!(link instanceof HTMLLinkElement)) {
      throw new Error("Expected stylesheet link")
    }
    const expectedHref = new URL("/assets/app.css", document.baseURI).href

    const root = document.createElement("article")
    root.textContent = "Styled content"
    document.body.append(root)

    const html = serializeMarkdownPdfDocument({
      title: "Styled PDF",
      element: root,
    })

    expect(html).toContain(`href="${expectedHref}"`)
    expect(html).toContain('data-buddy-style="app"')
    expect(html).not.toContain('href="/assets/app.css"')
  })

  test("waits for pending markdown export render markers", async () => {
    const root = document.createElement("article")
    const pending = document.createElement("div")
    pending.setAttribute("data-markdown-export-status", "loading")
    root.append(pending)
    document.body.append(root)

    const ready = waitForMarkdownPdfRenderReady(root)
    pending.setAttribute("data-markdown-export-status", "ready")
    await ready

    const html = serializeMarkdownPdfDocument({
      title: "Ready PDF",
      element: root,
    })

    expect(html).toContain('data-markdown-export-status="ready"')
    expect(html).not.toContain('data-markdown-export-status="loading"')
  })
})
