import type { EPUB, EPUBManifestItem } from "foliate-js/epub.js"
import type { FoliateBook, View } from "foliate-js/view.js"
import { z } from "zod"
import {
  emptyFoliateChapter,
  sanitizeFoliateChapter,
  sanitizeFoliateSvg,
  sanitizeFoliateSvgPage,
} from "./foliate-chapter-sanitize"
import { foliateResourceType } from "./foliate-resource-type"

const XHTML_TYPE = "application/xhtml+xml"

type TransformData = {
  name: string
  data: string | Blob | Promise<string | Blob>
  type: string
}

type BookResource =
  | { kind: "page"; type: "text/html" | "application/xhtml+xml"; clean: (text: string) => string }
  | { kind: "blank"; type: "application/xhtml+xml" }
  | { kind: "svg"; type: "image/svg+xml" }
  | { kind: "unchanged"; type: string }
  | { kind: "empty"; type: "application/octet-stream" }

function unsupportedFormat() {
  return {
    status: "error" as const,
    error: new Error("This book format cannot be opened safely. Use EPUB instead."),
  }
}

async function isComicArchive(input: string | Blob): Promise<boolean> {
  if (!(input instanceof Blob)) return false
  if (
    input.type !== "application/vnd.comicbook+zip" &&
    !(input instanceof File && input.name.endsWith(".cbz"))
  )
    return false
  const signature = new Uint8Array(await input.slice(0, 4).arrayBuffer())
  return (
    signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 0x03 && signature[3] === 0x04
  )
}

function bookResource(declaredType: string, isPage: boolean): BookResource {
  const resource = foliateResourceType(declaredType)
  switch (resource.category) {
    case "html":
      return {
        kind: "page",
        type: "text/html",
        clean: (text) => sanitizeFoliateChapter(text, "text/html"),
      }
    case "xhtml":
      return {
        kind: "page",
        type: XHTML_TYPE,
        clean: (text) => sanitizeFoliateChapter(text, XHTML_TYPE),
      }
    case "svg":
      return isPage
        ? { kind: "page", type: XHTML_TYPE, clean: sanitizeFoliateSvgPage }
        : { kind: "svg", type: "image/svg+xml" }
    case "inert":
      return { kind: "unchanged", type: resource.type }
    case "document":
      return { kind: "blank", type: XHTML_TYPE }
    case "unknown":
      return isPage
        ? { kind: "blank", type: XHTML_TYPE }
        : { kind: "empty", type: "application/octet-stream" }
  }
}

async function cleanBookData(resource: BookResource, data: string | Blob): Promise<string | Blob> {
  if (resource.kind === "unchanged") return data
  if (resource.kind === "empty") return ""
  if (resource.kind === "blank") return emptyFoliateChapter()
  const text = data instanceof Blob ? await data.text() : data
  return resource.kind === "svg" ? sanitizeFoliateSvg(text) : resource.clean(text)
}

function serializeFoliateChapter(text: string, type: string) {
  if (type !== XHTML_TYPE && type !== "text/html" && type !== "image/svg+xml") return { text, type }
  let doc = new DOMParser().parseFromString(text, type)
  if (
    type === XHTML_TYPE &&
    (doc.querySelector("parsererror") || !doc.documentElement?.namespaceURI)
  ) {
    type = "text/html"
    doc = new DOMParser().parseFromString(text, "text/html")
  }
  return { text: new XMLSerializer().serializeToString(doc), type }
}

function secureEpub(book: EPUB & { transformTarget: EventTarget }): void {
  const pages = new Set(book.sections.map((section) => section.id))
  book.transformTarget.addEventListener("data", (event) => {
    if (!(event instanceof CustomEvent)) return
    const detail: TransformData = event.detail
    const resource = bookResource(detail.type, pages.has(detail.name))
    detail.type = resource.type
    detail.data = Promise.resolve(detail.data).then((data) => cleanBookData(resource, data))
  })
  book.loadDocument = async (item: EPUBManifestItem) => {
    const chapter = serializeFoliateChapter((await book.loadText(item.href)) ?? "", item.mediaType)
    const resource = bookResource(chapter.type, pages.has(item.href))
    if (resource.kind === "page")
      return new DOMParser().parseFromString(resource.clean(chapter.text), resource.type)
    return new DOMParser().parseFromString(emptyFoliateChapter(), XHTML_TYPE)
  }
}

export async function openFoliateBook(
  view: Pick<View, "open">,
  input: string | Blob | FoliateBook,
): Promise<{ status: "opened" } | { status: "error"; error: Error }> {
  try {
    const url = z.string().safeParse(input)
    if (!(input instanceof Blob) && !url.success) return unsupportedFormat()
    const freshInput = input instanceof Blob ? input : url.data
    if (!freshInput) return unsupportedFormat()
    const [{ EPUB }, { makeBook }] = await Promise.all([
      import("foliate-js/epub.js"),
      import("foliate-js/view.js"),
    ])
    const book = await makeBook(freshInput)
    if (!(book instanceof EPUB)) {
      if (!(await isComicArchive(freshInput))) {
        await book.destroy?.()
        return unsupportedFormat()
      }
    } else {
      const transformTarget = book.transformTarget
      if (!transformTarget) {
        await book.destroy?.()
        return { status: "error", error: new Error("This EPUB has no chapter security transform.") }
      }
      secureEpub(Object.assign(book, { transformTarget }))
    }
    await view.open(book)
    return { status: "opened" }
  } catch (cause) {
    return { status: "error", error: cause instanceof Error ? cause : new Error(String(cause)) }
  }
}
