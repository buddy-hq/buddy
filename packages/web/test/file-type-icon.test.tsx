import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { createFileTypeIconElement, FileTypeIcon } from "../src/components/files/file-type-icon"
import type { WorkspaceMediaKind } from "../src/lib/workspace-file-media"

type IconInput = {
  readonly fileName: string
  readonly mediaKind?: WorkspaceMediaKind
}

function reactIcon(input: IconInput): HTMLElement | SVGElement {
  const container = document.createElement("div")
  container.innerHTML = renderToStaticMarkup(<FileTypeIcon {...input} className="size-3" />)
  const icon = container.firstElementChild
  if (!(icon instanceof HTMLElement) && !(icon instanceof SVGElement)) {
    throw new Error("FileTypeIcon did not render an element")
  }
  return icon
}

const RENDERERS = [
  { name: "React", render: reactIcon },
  {
    name: "imperative DOM",
    render: (input: IconInput) =>
      createFileTypeIconElement(input.fileName, "size-3", input.mediaKind),
  },
]

describe("FileTypeIcon", () => {
  test("renders markdown icons as theme-colored inline SVGs", () => {
    const html = renderToStaticMarkup(
      <FileTypeIcon fileName="notes.md" className="size-4 object-contain" />,
    )

    expect(html).toContain("<svg")
    expect(html).not.toContain("<img")
    expect(html).toContain("text-icon-info-base")
    expect(html).toContain('fill="currentColor"')
  })

  test("keeps non-markdown icons as image assets", () => {
    const html = renderToStaticMarkup(
      <FileTypeIcon fileName="app.tsx" className="size-4 object-contain" />,
    )

    expect(html).toContain("<img")
    expect(html).not.toContain("<svg")
  })
})

for (const renderer of RENDERERS) {
  describe(`file icon appearance · ${renderer.name}`, () => {
    let container: HTMLDivElement
    let stylesheet: HTMLStyleElement
    let originalMode: string | null

    beforeEach(async () => {
      originalMode = document.documentElement.getAttribute("data-color-scheme")
      stylesheet = document.createElement("style")
      stylesheet.textContent = await Bun.file(
        new URL("../src/components/files/file-type-icon.css", import.meta.url),
      ).text()
      document.head.append(stylesheet)
      container = document.createElement("div")
      document.body.append(container)
    })

    afterEach(() => {
      container.remove()
      stylesheet.remove()
      if (originalMode === null) document.documentElement.removeAttribute("data-color-scheme")
      else document.documentElement.setAttribute("data-color-scheme", originalMode)
    })

    test("shows original artwork on dark surfaces and the same silhouette with ink on light surfaces", () => {
      for (const mode of ["dark", "light", "dark"] as const) {
        document.documentElement.setAttribute("data-color-scheme", mode)
        const icon = renderer.render({ fileName: "index.js" })
        container.append(icon)
        const artwork = icon.querySelector("img")
        const lightInk = icon.querySelector("span")
        if (!artwork || !lightInk) throw new Error("Missing file artwork or light ink")

        if (mode === "light") expect(getComputedStyle(artwork).visibility).toBe("hidden")
        else expect(getComputedStyle(artwork).visibility).not.toBe("hidden")
        expect(getComputedStyle(lightInk).display).toBe(mode === "light" ? "block" : "none")
        expect(artwork.src).toEndWith("/javascript.svg")
        expect(lightInk.style.getPropertyValue("mask-image")).toContain(artwork.src)
        expect(artwork.alt).toBe("")
        expect(icon.getAttribute("aria-hidden")).toBe("true")
      }
    })

    test("uses the media-kind override for both original artwork and the light silhouette", () => {
      const icon = renderer.render({ fileName: "attachment.pdf", mediaKind: "spreadsheet" })
      container.append(icon)
      const artwork = icon.querySelector("img")
      const lightInk = icon.querySelector("span")
      if (!artwork || !lightInk) throw new Error("Missing spreadsheet artwork or light ink")

      expect(artwork.src).toEndWith("/microsoft-excel.svg")
      expect(lightInk.style.getPropertyValue("mask-image")).toContain(artwork.src)
      expect(artwork.src).not.toEndWith("/pdf.svg")
    })

    test("keeps PDF artwork fitted inside its inline wrapper under prose image styles", () => {
      container.className = "prose"
      // Chat's prose-sm image margins are 24px at its standard 14px type size.
      // Apply this after the icon rules to catch leakage independent of load order.
      stylesheet.textContent += `
        .prose img { display: block; margin: 24px 0; height: auto; max-width: 100%; }
      `
      const proseImage = document.createElement("img")
      container.append(proseImage)
      expect(getComputedStyle(proseImage).marginTop).toBe("24px")
      expect(getComputedStyle(proseImage).height).toBe("auto")

      for (const mode of ["dark", "light"] as const) {
        document.documentElement.setAttribute("data-color-scheme", mode)
        const icon = renderer.render({ fileName: "report.pdf" })
        icon.style.width = "12px"
        icon.style.height = "12px"
        container.append(icon)
        const artwork = icon.querySelector("img")
        if (!artwork) throw new Error("Missing PDF artwork")
        const paint = getComputedStyle(artwork)

        expect(paint.marginTop).toBe("0px")
        expect(paint.marginBottom).toBe("0px")
        expect(paint.position).toBe("absolute")
        expect(paint.getPropertyValue("inset")).toBe("0")
        expect(paint.width).toBe("100%")
        expect(paint.height).toBe("100%")
        expect(paint.objectFit).toBe("contain")
      }
    })

    test("uses strong theme ink for light Markdown and TypeScript blue for dark Markdown", () => {
      // These stand in for the app's generated semantic utility and root tokens;
      // the production stylesheet supplies the actual appearance selector.
      stylesheet.textContent =
        `
        .text-icon-info-base { color: var(--icon-info-base); }
      ` + stylesheet.textContent
      container.style.setProperty("--icon-info-base", "rgb(157, 190, 254)")
      container.style.setProperty("--text-info-strong", "rgb(23, 77, 143)")
      for (const mode of ["dark", "light", "dark"] as const) {
        document.documentElement.setAttribute("data-color-scheme", mode)
        const icon = renderer.render({ fileName: "notes.md" })
        container.append(icon)
        expect(getComputedStyle(icon).color).toBe(mode === "light" ? "rgb(23, 77, 143)" : "#0288d1")
        expect(icon.getAttribute("fill")).toBe("currentColor")
        expect(icon.getAttribute("aria-hidden")).toBe("true")
      }
    })
  })
}
