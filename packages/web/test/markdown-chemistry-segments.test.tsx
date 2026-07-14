import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  canContainChemistryBlock,
  Markdown,
} from "../src/components/markdown/Markdown"
import { parseMarkdownSegments } from "../src/components/markdown/markdown-segments"
import {
  CHEMISTRY_FORMATS,
  type ChemistryFormat,
} from "../src/components/media/renderers/chemistry/formats"
import { clearChemistryRenderCacheForTests } from "../src/components/media/renderers/chemistry/render"
import { ChemfigRenderRequestError } from "../src/components/media/renderers/chemistry/chemfig-adapter"
import { chemistryDiagramViewportClass } from "../src/components/media/renderers/chemistry/layout"

const originalIntersectionObserver = globalThis.IntersectionObserver

async function flushEffects(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return
    await act(flushEffects)
  }
  throw new Error("Expected Markdown chemistry rendering to settle.")
}

function chemistrySegments(markdown: string): Array<{
  format: ChemistryFormat
  source: string
}> {
  return parseMarkdownSegments(markdown).flatMap((segment) =>
    segment.kind === "chemistry"
      ? [{ format: segment.format, source: segment.source }]
      : [],
  )
}

describe("Markdown chemistry segments", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    Reflect.set(globalThis, "IntersectionObserver", undefined)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    clearChemistryRenderCacheForTests()
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = undefined
    container.remove()
    Reflect.set(globalThis, "IntersectionObserver", originalIntersectionObserver)
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("recognizes the canonical chemistry formats from both fence styles", () => {
    const markdown = CHEMISTRY_FORMATS.map((format, index) => {
      const fence = index % 2 === 0 ? "```" : "~~~"
      return `${fence}${format}\nsource-${format}\n${fence}`
    }).join("\n\n")

    expect(chemistrySegments(markdown)).toEqual(
      CHEMISTRY_FORMATS.map((format) => ({ format, source: `source-${format}` })),
    )
    expect(canContainChemistryBlock(`Before\n   \`\`\`SMILES\nCCO\n   \`\`\``)).toBe(
      true,
    )
  })

  test("uses deterministic viewport heights by chemistry format", () => {
    expect(
      Object.fromEntries(
        CHEMISTRY_FORMATS.map((format) => [
          format,
          chemistryDiagramViewportClass(format),
        ]),
      ),
    ).toEqual({
      smiles: "h-64",
      cxsmiles: "h-64",
      "reaction-smiles": "h-96",
      ket: "h-96",
      chemfig: "h-96",
    })
  })

  test("keeps incomplete chemistry fences as Markdown during streaming", () => {
    const markdown = "Start\n```smiles\nCCO"

    expect(parseMarkdownSegments(markdown)).toEqual([
      {
        kind: "html",
        markdown,
        segmentIndex: 0,
      },
    ])
  })

  test("preserves CRLF and multiline KET source exactly", () => {
    const source = [
      "{",
      '  "root": {',
      '    "nodes": [{ "$ref": "mol0" }]',
      "  },",
      '  "mol0": {}',
      "}",
    ].join("\r\n")
    const markdown = `\`\`\`ket alt="Editable molecule"\r\n${source}\r\n\`\`\``
    const segment = parseMarkdownSegments(markdown)[0]

    expect(segment?.kind).toBe("chemistry")
    if (segment?.kind !== "chemistry") throw new Error("Expected chemistry segment")
    expect(segment.source).toBe(source)
    expect(segment.raw).toBe(markdown)
    expect(segment.alt).toBe("Editable molecule")
    expect(segment.metadata.rawMetadata).toBe('alt="Editable molecule"')
  })

  test("applies CommonMark opening-fence indentation without changing line endings", () => {
    const markdown = "  ```smiles\r\n  CCO\r\n C=C\r\n  ```"
    const segment = parseMarkdownSegments(markdown)[0]

    expect(segment?.kind).toBe("chemistry")
    if (segment?.kind !== "chemistry") throw new Error("Expected chemistry segment")
    expect(segment.source).toBe("CCO\r\nC=C")
    expect(segment.raw).toBe(markdown)
  })

  test("applies CommonMark tab stops while dedenting fenced content", () => {
    const markdown = "  ```smiles\n\tCCO\n \tC=C\n  ```"
    const segment = parseMarkdownSegments(markdown)[0]

    expect(segment?.kind).toBe("chemistry")
    if (segment?.kind !== "chemistry") throw new Error("Expected chemistry segment")
    expect(segment.source).toBe("  CCO\n  C=C")
  })

  test("delegates list-nested chemistry fences as one unmodified Markdown segment", () => {
    const markdown = "- Compound\n\n  ```smiles alt=\"Ethanol\"\n  CCO\n  ```\n\n- Next"

    expect(parseMarkdownSegments(markdown)).toEqual([
      { kind: "html", markdown, segmentIndex: 0 },
    ])
  })

  test("delegates ordered-list and continuation-contained fences", () => {
    const ordered = "1. Compound\n\n   ```smiles\n   CCO\n   ```"
    const continued = "- Compound\n  notes\n  ```smiles\n  CCO\n  ```"
    const loose = "- Compound\n\n\n  ```smiles\n  CCO\n  ```"
    const variablyIndentedContinuation =
      "- Compound\n  continuation\n   ```smiles\n   CCO\n   ```"

    expect(parseMarkdownSegments(ordered)).toEqual([
      { kind: "html", markdown: ordered, segmentIndex: 0 },
    ])
    expect(parseMarkdownSegments(continued)).toEqual([
      { kind: "html", markdown: continued, segmentIndex: 0 },
    ])
    expect(parseMarkdownSegments(loose)).toEqual([
      { kind: "html", markdown: loose, segmentIndex: 0 },
    ])
    expect(parseMarkdownSegments(variablyIndentedContinuation)).toEqual([
      {
        kind: "html",
        markdown: variablyIndentedContinuation,
        segmentIndex: 0,
      },
    ])
  })

  test("does not mistake a thematic break for a list container", () => {
    const markdown = "---\n   ```smiles\n   CCO\n   ```"
    const segments = parseMarkdownSegments(markdown)

    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ kind: "html", markdown: "---" })
    expect(segments[1]).toMatchObject({ kind: "chemistry", source: "CCO" })
  })

  test("keeps chemistry after an indented thematic break inside its list container", () => {
    const markdown =
      "- Compound\n\n  ---\n\n  ```smiles alt=\"Ethanol\"\n  CCO\n  ```\n\n- Next"

    expect(parseMarkdownSegments(markdown)).toEqual([
      { kind: "html", markdown, segmentIndex: 0 },
    ])
  })

  test("does not treat tab-indented fences as CommonMark fenced blocks", () => {
    const markdown = "\t```smiles\nCCO\n\t```"
    expect(parseMarkdownSegments(markdown)).toEqual([
      { kind: "html", markdown, segmentIndex: 0 },
    ])
  })

  test("does not extract chemistry nested inside another fenced code block", () => {
    const markdown = "````text\n```smiles\nCCO\n```\n````"

    expect(parseMarkdownSegments(markdown)).toEqual([
      {
        kind: "html",
        markdown,
        segmentIndex: 0,
      },
    ])
  })

  test("renders chemistry automatically without enabling Mermaid", async () => {
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><path d="M0 20h80" /></svg>',
    })

    await act(async () => {
      root.render(<Markdown text={"Before\n\n```smiles\nCCO\n```\n\nAfter"} />)
      await flushEffects()
    })
    await waitFor(
      () =>
        container
          .querySelector('[data-component="chemistry-diagram"]')
          ?.getAttribute("data-markdown-export-status") === "ready",
    )

    const chemistry = container.querySelector('[data-component="markdown-chemistry"]')
    expect(chemistry?.getAttribute("data-chemistry-format")).toBe("smiles")
    expect(
      container.querySelector('[data-component="chemistry-diagram"] > div')?.classList,
    ).toContain(chemistryDiagramViewportClass("smiles"))
    expect(chemistry?.getAttribute("aria-label")).toBe(
      "SMILES chemistry structure: CCO",
    )
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "SMILES chemistry structure: CCO",
    )
    const renderedSvgHost = container.querySelector('[data-component="chemistry-svg"]')
    expect(renderedSvgHost?.classList).not.toContain("bg-background-base")
    expect(renderedSvgHost?.classList).not.toContain("border")
    expect(renderedSvgHost?.classList).not.toContain("rounded-xl")
    expect(container.textContent).toContain("Before")
    expect(container.textContent).not.toContain("Chemistry")
    expect(container.textContent).not.toContain("SMILES")
    expect(container.textContent).toContain("After")
  })

  test("keeps the fixed transparent viewport while chemistry is loading", async () => {
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = () => new Promise(() => undefined)

    await act(async () => {
      root.render(<Markdown text={"```smiles\nCCO\n```"} />)
      await flushEffects()
    })
    await waitFor(
      () =>
        container
          .querySelector('[data-component="chemistry-diagram"]')
          ?.getAttribute("data-markdown-export-status") === "loading",
    )

    const viewport = container.querySelector('[data-component="chemistry-diagram"] > div')
    const loading = container.querySelector('[role="status"]')
    expect(viewport?.classList).toContain(chemistryDiagramViewportClass("smiles"))
    expect(loading?.classList).not.toContain("bg-background-base")
    expect(loading?.classList).not.toContain("border")
    expect(loading?.classList).not.toContain("rounded-xl")
  })

  test("uses authored alt text without displaying caption metadata", async () => {
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><path d="M0 20h80" /></svg>',
    })

    await act(async () => {
      root.render(
        <Markdown
          text={'```smiles alt="Ethanol structure" caption="Two-carbon alcohol"\nCCO\n```'}
        />,
      )
      await flushEffects()
    })
    await waitFor(
      () =>
        container
          .querySelector('[data-component="chemistry-diagram"]')
          ?.getAttribute("data-markdown-export-status") === "ready",
    )

    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "Ethanol structure",
    )
    expect(container.querySelector("figcaption")).toBeNull()
    expect(container.textContent).not.toContain("Two-carbon alcohol")
  })

  test("does not blame backend conversion failures on Chemfig syntax", async () => {
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async () => {
      throw new ChemfigRenderRequestError(
        "The chemfig backend could not convert the compiled TeX output to SVG.",
        "chemfig_dvi_conversion_failed",
      )
    }

    const markdown = ["```chemfig", String.raw`\chemfig{C-C}`, "```"].join("\n")
    await act(async () => {
      root.render(<Markdown text={markdown} />)
      await flushEffects()
    })
    await waitFor(() => container.textContent?.includes("failed after receiving") === true)

    expect(
      container.querySelector('[data-component="chemistry-diagram"] > div')?.classList,
    ).toContain(chemistryDiagramViewportClass("chemfig"))
    expect(container.textContent).toContain("Retry or report the failure")
    expect(container.textContent).not.toContain("matches chemfig syntax")
  })

  test("keeps raw Mermaid visible when chemistry activates segmentation", async () => {
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><path d="M0 20h80" /></svg>',
    })
    const markdown = [
      "```mermaid",
      "graph TD",
      "A-->B",
      "```",
      "",
      "```smiles",
      "CCO",
      "```",
    ].join("\n")

    await act(async () => {
      root.render(<Markdown text={markdown} />)
      await flushEffects()
    })
    await waitFor(
      () =>
        container
          .querySelector('[data-component="chemistry-diagram"]')
          ?.getAttribute("data-markdown-export-status") === "ready" &&
        container.textContent?.includes("graph TD") === true,
    )

    expect(container.querySelector('[data-component="markdown-chemistry"]')).not.toBeNull()
    expect(container.querySelector('[data-component="mermaid-diagram"]')).toBeNull()
    expect(container.textContent).toContain("graph TD")
    expect(container.textContent).toContain("A-->B")
  })
})
