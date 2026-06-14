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
    expect(html).not.toContain(">Toolbar<")

    root.remove()
  })

  test("keeps rendered math controls that are not real buttons", () => {
    const root = document.createElement("article")
    root.innerHTML = `
      <span data-component="markdown-bench-math" data-display="inline">
        <span role="button" tabindex="0"><span class="katex">E = mc^2</span></span>
      </span>
      <button type="button">Copy</button>
    `
    document.body.append(root)

    const html = serializeMarkdownPdfDocument({
      title: "Math",
      element: root,
    })

    expect(html).toContain("E = mc^2")
    expect(html).toContain('data-component="markdown-bench-math"')
    expect(html).not.toContain("<button")
    expect(html).not.toContain(">Copy<")

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

  test("removes MDXEditor table controls before PDF serialization", () => {
    const root = document.createElement("article")
    root.innerHTML = `
      <table class="_tableEditor_test">
        <colgroup><col><col><col><col></colgroup>
        <thead>
          <tr>
            <th></th>
            <th data-tool-cell="true">Column tools</th>
            <th data-tool-cell="true">Column tools</th>
            <th data-tool-cell="true">Delete</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th data-tool-cell="true">Row tools</th>
            <th>Description</th>
            <th>State</th>
            <th data-tool-cell="true">Add column</th>
          </tr>
          <tr>
            <td data-tool-cell="true">Row tools</td>
            <td>Particles are close together.</td>
            <td>Solid</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th></th>
            <th data-tool-cell="true" colspan="2">Add row</th>
            <th></th>
          </tr>
        </tfoot>
      </table>
    `
    document.body.append(root)

    const html = serializeMarkdownPdfDocument({
      title: "Table",
      element: root,
    })
    const documentClone = new DOMParser().parseFromString(html, "text/html")
    const table = documentClone.querySelector("table")

    expect(table?.querySelector("thead")).toBeNull()
    expect(table?.querySelector("tfoot")).toBeNull()
    expect(table?.querySelector("[data-tool-cell]")).toBeNull()
    expect(table?.querySelectorAll("col").length).toBe(2)
    expect(table?.textContent).toContain("Description")
    expect(table?.textContent).toContain("Particles are close together.")
    expect(table?.textContent).not.toContain("Column tools")
    expect(table?.textContent).not.toContain("Row tools")

    root.remove()
  })

  test("overrides MDXEditor and CodeMirror theme tokens for printable PDFs", () => {
    document.head.innerHTML = `
      <style id="dark-editor-theme">
        :root {
          --markdown-text: #bfdbfe;
          --markdown-code: #a3e635;
          --syntax-string: #a3e635;
          --background-stronger: #020617;
          --text-base: #bfdbfe;
        }
        .cm-line { color: var(--syntax-string); }
        .cm-gutters { background: #020617; color: #f8fafc; }
      </style>
    `

    const root = document.createElement("article")
    root.className = "markdown-bench-editor bg-background-base text-text-base"
    root.innerHTML = `
      <div class="mdxeditor prose" contenteditable="true" style="color: var(--markdown-text)">
        <p>Washed out <strong>bold</strong> <em>italic</em> <code>inline</code></p>
        <div class="cm-editor">
          <div class="cm-gutters"><div class="cm-gutterElement">1</div></div>
          <div class="cm-scroller">
            <div class="cm-content">
              <div class="cm-line"><span style="color: var(--syntax-string)">"value"</span></div>
            </div>
          </div>
        </div>
      </div>
    `
    document.body.append(root)

    const html = serializeMarkdownPdfDocument({
      title: "Bench PDF",
      element: root,
    })

    const appMarkdownTokenIndex = html.indexOf("--markdown-text: #bfdbfe;")
    const printMarkdownTokenIndex = html.indexOf("--markdown-text: var(--markdown-pdf-text);")
    expect(appMarkdownTokenIndex).toBeGreaterThanOrEqual(0)
    expect(printMarkdownTokenIndex).toBeGreaterThan(appMarkdownTokenIndex)
    expect(html).toContain("--markdown-pdf-text: #111827;")
    expect(html).toContain("--color-text-base: var(--markdown-pdf-text);")
    expect(html).toContain("--syntax-string: #166534;")
    expect(html).toContain("[data-markdown-export-root] .mdxeditor")
    expect(html).toContain("[data-markdown-export-root] .cm-editor")
    expect(html).toContain("caret-color: transparent !important;")
  })

  test("defines a print-specific typographic hierarchy", () => {
    const root = document.createElement("article")
    root.innerHTML = `
      <h1>Document title</h1>
      <p>Paragraph with <strong>bold</strong> and <code>inline</code> code.</p>
      <h2>Section</h2>
      <h3>Subsection</h3>
      <h4>Detail</h4>
      <h5>Minor detail</h5>
      <h6>Label</h6>
    `
    document.body.append(root)

    const html = serializeMarkdownPdfDocument({
      title: "Typography",
      element: root,
    })

    expect(html).toContain("font-size: 11pt !important;")
    expect(html).toContain("line-height: 1.5 !important;")
    expect(html).toContain("letter-spacing: 0 !important;")
    expect(html).toContain("font-size: 18pt !important;")
    expect(html).toContain("font-size: 15pt !important;")
    expect(html).toContain("font-size: 13pt !important;")
    expect(html).toContain("font-size: inherit !important;")
    expect(html).toContain("font-weight: 600 !important;")
    expect(html).toContain("font-size: 0.92em !important;")
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
