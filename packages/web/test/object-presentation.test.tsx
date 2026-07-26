import "../happydom"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ObjectRow } from "../src/components/objects/object-presentation"
import { describeObject, thumbnailEarnsItsSpace } from "../src/components/objects/describe-object"
import {
  OBJECT_KIND_WORKSPACE_FILE,
  OBJECT_ROW_HEIGHT_PX,
  OBJECT_SHELF_GAP_PX,
  OBJECT_STATUS_ERROR,
  OBJECT_STATUS_PREPARING,
  OBJECT_THUMBNAIL_FILE_TYPE,
  OBJECT_THUMBNAIL_IMAGE,
  OBJECT_TILE_MIN_WIDTH_PX,
  OBJECT_TILE_WIDTH_PX,
  OBJECT_VARIANT_CARD,
  OBJECT_VARIANT_LG,
  OBJECT_VARIANT_MD,
  OBJECT_VARIANT_SM,
  OBJECT_VARIANT_TILE,
  objectCardHeightPx,
  objectPresentationHeightPx,
  objectShelfColumns,
  objectShelfHeightPx,
  objectTileHeightPx,
} from "../src/components/objects/types"
import type { BenchTarget } from "../src/lib/bench-targets"

const QUESTION_SET_TARGET: BenchTarget = {
  type: "object",
  ref: { kind: "question-set", objectID: "qs-1", revisionID: null, itemID: null },
  viewID: "practice",
}

let root: Root | undefined
let host: HTMLElement | undefined

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
})

afterAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

function render(node: React.ReactNode) {
  host = document.createElement("div")
  document.body.append(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(host)
  act(() => {
    root?.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  })
  return host
}

function rowFor(status?: typeof OBJECT_STATUS_ERROR | typeof OBJECT_STATUS_PREPARING) {
  const model = describeObject({
    target: QUESTION_SET_TARGET,
    kind: "question-set",
    title: "Chapter 4 review",
    meta: ["Question set", "6 questions"],
    ...(status ? { status } : {}),
    ...(status === OBJECT_STATUS_ERROR ? { statusMessage: "Object unavailable" } : {}),
  })
  const container = render(<ObjectRow model={model} variant={OBJECT_VARIANT_MD} />)
  const row = container.querySelector("[data-component='object-row']")
  if (!(row instanceof HTMLElement)) throw new Error("row did not render")
  return row
}

describe("object presentation height contract", () => {
  test("the row keeps one height class across ready, preparing and error", () => {
    const ready = rowFor().className
    act(() => root?.unmount())
    host?.remove()

    const preparing = rowFor(OBJECT_STATUS_PREPARING).className
    act(() => root?.unmount())
    host?.remove()

    const failed = rowFor(OBJECT_STATUS_ERROR).className

    expect(ready).toContain("h-14")
    expect(preparing).toContain("h-14")
    expect(failed).toContain("h-14")
    // A `min-h` anywhere would let content push the row and break virtual measurement.
    expect(ready).not.toContain("min-h")
    expect(preparing).not.toContain("min-h")
    expect(failed).not.toContain("min-h")
  })

  test("an unavailable row swaps meta for the status message without adding a line", () => {
    const row = rowFor(OBJECT_STATUS_ERROR)
    expect(row.textContent).toContain("Object unavailable")
    expect(row.textContent).not.toContain("6 questions")
    expect(row.querySelectorAll("p")).toHaveLength(2)
  })

  test("sm drops the meta line and names the kind instead", () => {
    const model = describeObject({
      target: QUESTION_SET_TARGET,
      kind: "question-set",
      title: "Chapter 4 review",
      meta: ["Question set", "6 questions"],
    })
    const container = render(<ObjectRow model={model} variant={OBJECT_VARIANT_SM} />)
    const row = container.querySelector("[data-component='object-row']")
    if (!(row instanceof HTMLElement)) throw new Error("row did not render")

    expect(row.className).toContain("h-9")
    expect(row.querySelectorAll("p")).toHaveLength(1)
    expect(row.textContent).toContain("Question set")
    expect(row.textContent).not.toContain("6 questions")
  })

  test("lg is a taller row, not a card", () => {
    const model = describeObject({
      target: QUESTION_SET_TARGET,
      kind: "question-set",
      title: "Chapter 4 review",
      meta: ["Question set", "6 questions"],
    })
    const container = render(<ObjectRow model={model} variant={OBJECT_VARIANT_LG} />)
    const row = container.querySelector("[data-component='object-row']")
    if (!(row instanceof HTMLElement)) throw new Error("row did not render")

    expect(row.className).toContain("h-20")
    expect(row.className).not.toContain("min-h")
    expect(row.querySelectorAll("p")).toHaveLength(2)
    expect(objectPresentationHeightPx(OBJECT_VARIANT_LG, 320)).toBe(
      OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_LG],
    )
  })

  test("preparing shimmers the visual slot but keeps the title readable", () => {
    const row = rowFor(OBJECT_STATUS_PREPARING)
    // A whole-row skeleton would hide the title for as long as the build takes.
    expect(row.textContent).toContain("Chapter 4 review")
    expect(row.querySelector("[data-slot='skeleton'].absolute")).toBeNull()
    expect(row.querySelector("[data-slot='skeleton']")).not.toBeNull()
  })

  test("a disabled row cannot be opened", () => {
    let opened = 0
    const model = describeObject({
      target: QUESTION_SET_TARGET,
      kind: "question-set",
      title: "Chapter 4 review",
    })
    const container = render(
      <ObjectRow model={model} variant={OBJECT_VARIANT_MD} disabled onOpen={() => opened++} />,
    )
    const row = container.querySelector("[data-component='object-row']")
    if (!(row instanceof HTMLElement)) throw new Error("row did not render")

    expect(row.getAttribute("role")).toBeNull()
    expect(row.getAttribute("aria-disabled")).toBe("true")
    act(() => row.click())
    expect(opened).toBe(0)
  })

  test("reported heights match the rendered variants", () => {
    expect(objectPresentationHeightPx(OBJECT_VARIANT_SM, 320)).toBe(
      OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_SM],
    )
    expect(objectPresentationHeightPx(OBJECT_VARIANT_MD, 320)).toBe(
      OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_MD],
    )
    expect(objectPresentationHeightPx(OBJECT_VARIANT_TILE, 320)).toBe(objectTileHeightPx())
    expect(objectPresentationHeightPx(OBJECT_VARIANT_CARD, 320)).toBe(objectCardHeightPx(320))
    // 16:9 preview + 72px footer + 1px border top and bottom.
    expect(objectCardHeightPx(320)).toBe(180 + 72 + 2)
    expect(objectTileHeightPx()).toBe(Math.round(OBJECT_TILE_WIDTH_PX / (3 / 4)))
  })

  test("a shelf gains columns as it widens instead of enlarging its covers", () => {
    // The covers must stay near their minimum at every width, or a wide drawer
    // would show six covers the size of cards.
    for (const width of [320, 380, 560, 820, 1200]) {
      const columns = objectShelfColumns(width)
      const tileWidth = (width - OBJECT_SHELF_GAP_PX * (columns - 1)) / columns
      expect(tileWidth).toBeGreaterThanOrEqual(OBJECT_TILE_MIN_WIDTH_PX)
      expect(tileWidth).toBeLessThan(OBJECT_TILE_MIN_WIDTH_PX * 2)
    }
  })

  test("a shelf reports the height of the whole band, wrapped rows included", () => {
    const width = 380
    const columns = objectShelfColumns(width)
    const oneRow = objectShelfHeightPx(width, columns)
    const twoRows = objectShelfHeightPx(width, columns + 1)

    expect(twoRows).toBe(oneRow * 2 + OBJECT_SHELF_GAP_PX)
    // An empty shelf is not a negative box.
    expect(objectShelfHeightPx(width, 0)).toBe(oneRow)
  })
})

describe("describeObject", () => {
  test("falls back to the kind label when no meta is supplied", () => {
    const model = describeObject({
      target: QUESTION_SET_TARGET,
      kind: "question-set",
      title: "Chapter 4 review",
    })
    expect(model.meta).toEqual(["Question set"])
  })

  test("drops blank meta parts so the middot join never dangles", () => {
    const model = describeObject({
      target: QUESTION_SET_TARGET,
      kind: "question-set",
      title: "Chapter 4 review",
      meta: ["Question set", "", "   "],
    })
    expect(model.meta).toEqual(["Question set"])
  })
})

describe("thumbnailEarnsItsSpace", () => {
  const image = { source: OBJECT_THUMBNAIL_IMAGE, src: "/raw.png", alt: "" } as const
  const fileType = { source: OBJECT_THUMBNAIL_FILE_TYPE, path: "notes/diagram.mmd" } as const

  test("costly thumbnails earn it only on kinds that survive downsampling", () => {
    expect(thumbnailEarnsItsSpace(image, "resource")).toBe(true)
    expect(thumbnailEarnsItsSpace(image, "figure")).toBe(true)
    expect(thumbnailEarnsItsSpace(image, "media-presentation")).toBe(true)
    expect(thumbnailEarnsItsSpace(image, "mermaid")).toBe(false)
    expect(thumbnailEarnsItsSpace(image, "html-widget")).toBe(false)
  })

  test("a file-type mark always earns it, because it is itself a glyph", () => {
    expect(thumbnailEarnsItsSpace(fileType, OBJECT_KIND_WORKSPACE_FILE)).toBe(true)
    expect(thumbnailEarnsItsSpace(fileType, "mermaid")).toBe(true)
  })
})

describe("workspace file defaults", () => {
  function fileModel(path: string, directory?: string) {
    return describeObject({
      target: { type: "workspace-file", path, viewer: "file" },
      kind: OBJECT_KIND_WORKSPACE_FILE,
      title: path.slice(path.lastIndexOf("/") + 1),
      ...(directory ? { directory } : {}),
    })
  }

  test("a file describes itself without the call site opting in", () => {
    const model = fileModel("notes/week-3/slides.pptx")
    expect(model.thumbnail).toEqual({
      source: OBJECT_THUMBNAIL_FILE_TYPE,
      path: "notes/week-3/slides.pptx",
    })
  })

  test("the label is what the file is, not the flat kind", () => {
    // "File" tells a reader nothing they cannot see from the name.
    expect(fileModel("diagrams/cell.png").kindLabel).toBe("Image")
    expect(fileModel("data/enrolment.xlsx").kindLabel).toBe("Spreadsheet")
    expect(fileModel("sources/ncert.pdf").kindLabel).toBe("PDF")
    expect(fileModel("notes/week-3.md").kindLabel).toBe("File")
    expect(fileModel("diagrams/cell.png").meta).toEqual(["Image"])
  })

  test("a directory lets an image show itself", () => {
    expect(fileModel("diagrams/cell.png", "/notebook").thumbnail).toEqual({
      source: OBJECT_THUMBNAIL_FILE_TYPE,
      path: "diagrams/cell.png",
      directory: "/notebook",
    })
  })

  test("an explicit thumbnail always wins over the derived one", () => {
    const model = describeObject({
      kind: OBJECT_KIND_WORKSPACE_FILE,
      title: "cell.png",
      thumbnail: { source: OBJECT_THUMBNAIL_IMAGE, src: "/custom.png", alt: "" },
    })
    expect(model.thumbnail?.source).toBe(OBJECT_THUMBNAIL_IMAGE)
  })
})
