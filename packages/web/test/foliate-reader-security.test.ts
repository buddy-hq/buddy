import { afterAll, beforeAll, expect, test } from "bun:test"
import path from "node:path"
import { QueryClient } from "@tanstack/react-query"
import {
  TransformStream as WebTransformStream,
  WritableStream as WebWritableStream,
} from "node:stream/web"
import { View, makeBook } from "foliate-js/view.js"
import { openFoliateBook } from "../src/components/readers/foliate-book"
import { toFoliateInput } from "../src/components/readers/utils/foliate-helpers"
import { getPlatform, setRuntimePlatform } from "../src/context/platform"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import { ensureFoliateRuntimeCompat } from "../src/lib/foliate/ensure-foliate-runtime-compat"
import { readingResourceBlobQueryOptions } from "../src/state/resources-query"
import { installFoliateDomRuntime } from "./fixtures/foliate-dom-runtime"

type QuerySelectorAll<TParent> = <E extends Element = Element>(
  this: TParent,
  selectors: string,
) => NodeListOf<E>

const elementQuerySelectorAll: QuerySelectorAll<Element> = Element.prototype.querySelectorAll
const documentQuerySelectorAll: QuerySelectorAll<Document> = XMLDocument.prototype.querySelectorAll
const htmlDocumentQuerySelectorAll: QuerySelectorAll<Document> =
  HTMLDocument.prototype.querySelectorAll

const originals = {
  lookupNamespaceURI: Object.getOwnPropertyDescriptor(Node.prototype, "lookupNamespaceURI"),
  lookupPrefix: Object.getOwnPropertyDescriptor(Node.prototype, "lookupPrefix"),
  querySelectorAll: elementQuerySelectorAll,
  documentQuerySelectorAll,
  htmlDocumentQuerySelectorAll,
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
  writableStream: Object.getOwnPropertyDescriptor(globalThis, "WritableStream"),
  transformStream: Object.getOwnPropertyDescriptor(globalThis, "TransformStream"),
}
const restoreDomRuntime = installFoliateDomRuntime()
const blobs = new Map<string, Blob>()
let createdURLs = 0
const SVG = "http://www.w3.org/2000/svg"
const XLINK = "http://www.w3.org/1999/xlink"
const CSP = "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"
type TestBrowserSettings = {
  disableCSSFileLoading: boolean
  disableJavaScriptFileLoading: boolean
  disableJavaScriptEvaluation: boolean
  disableIframePageLoading: boolean
  handleDisabledFileLoadingAsSuccess: boolean
}
const browserAPI = Object.getOwnPropertyDescriptor(globalThis, "happyDOM")
if (!browserAPI) throw new Error("This reader test requires the happy-dom preload")
const { settings }: { settings: TestBrowserSettings } = browserAPI.value
const previousSettings = { ...settings }

beforeAll(() => {
  ensureFoliateRuntimeCompat()
  if (settings) {
    settings.disableCSSFileLoading = true
    settings.disableJavaScriptFileLoading = true
    settings.disableJavaScriptEvaluation = true
    settings.disableIframePageLoading = true
    settings.handleDisabledFileLoadingAsSuccess = true
  }
  Object.defineProperty(globalThis, "WritableStream", {
    configurable: true,
    value: WebWritableStream,
  })
  Object.defineProperty(globalThis, "TransformStream", {
    configurable: true,
    value: WebTransformStream,
  })
  Object.defineProperty(Node.prototype, "lookupNamespaceURI", {
    configurable: true,
    value(this: Node, prefix: string | null) {
      const element = this instanceof Document ? this.documentElement : this
      if (!(element instanceof Element)) return null
      return (
        element.getAttribute(prefix ? `xmlns:${prefix}` : "xmlns") ??
        element.parentElement?.lookupNamespaceURI(prefix) ??
        null
      )
    },
  })
  Object.defineProperty(Node.prototype, "lookupPrefix", {
    configurable: true,
    value(this: Node, namespace: string | null) {
      const element = this instanceof Document ? this.documentElement : this
      if (!(element instanceof Element)) return null
      return (
        Array.from(element.attributes)
          .find((attr) => attr.name.startsWith("xmlns:") && attr.value === namespace)
          ?.name.slice(6) ??
        element.parentElement?.lookupPrefix(namespace) ??
        null
      )
    },
  })
  Element.prototype.querySelectorAll = function <E extends Element = Element>(
    selectors: string,
  ): NodeListOf<E> {
    if (selectors === "[*|href]:not([href])") {
      return (originals.querySelectorAll<E>).call(this, "[xlink\\:href]:not([href])")
    }
    return (originals.querySelectorAll<E>).call(this, selectors)
  }
  XMLDocument.prototype.querySelectorAll = function <E extends Element = Element>(
    selectors: string,
  ): NodeListOf<E> {
    return (originals.documentQuerySelectorAll<E>).call(
      this,
      selectors === "[*|href]:not([href])" ? "[xlink\\:href]:not([href])" : selectors,
    )
  }
  HTMLDocument.prototype.querySelectorAll = function <E extends Element = Element>(
    selectors: string,
  ): NodeListOf<E> {
    return (originals.htmlDocumentQuerySelectorAll<E>).call(
      this,
      selectors === "[*|href]:not([href])" ? "[xlink\\:href]:not([href])" : selectors,
    )
  }
  URL.createObjectURL = (blob) => {
    if (!(blob instanceof Blob)) throw new Error("Expected a chapter Blob")
    const url = `blob:foliate-test/${createdURLs++}`
    blobs.set(url, blob)
    return url
  }
  URL.revokeObjectURL = (url) => {
    blobs.delete(url)
  }
})

afterAll(() => {
  restoreDomRuntime()
  if (settings && previousSettings) Object.assign(settings, previousSettings)
  for (const key of ["lookupNamespaceURI", "lookupPrefix"] as const) {
    const descriptor = originals[key]
    if (descriptor) Object.defineProperty(Node.prototype, key, descriptor)
    else Reflect.deleteProperty(Node.prototype, key)
  }
  Element.prototype.querySelectorAll = originals.querySelectorAll
  XMLDocument.prototype.querySelectorAll = originals.documentQuerySelectorAll
  HTMLDocument.prototype.querySelectorAll = originals.htmlDocumentQuerySelectorAll
  URL.createObjectURL = originals.createObjectURL
  URL.revokeObjectURL = originals.revokeObjectURL
  if (originals.writableStream)
    Object.defineProperty(globalThis, "WritableStream", originals.writableStream)
  if (originals.transformStream)
    Object.defineProperty(globalThis, "TransformStream", originals.transformStream)
  blobs.clear()
})

test.each([
  ["Windows", path.win32.join("C:\\buddy-v2-e2e", "पढ़ाई"), path.win32.join("books", "éditions")],
  ["macOS", "/buddy-v2-e2e/पढ़ाई", "books/éditions"],
])("Sources EPUB bytes survive %s SDK requests", async (_platformName, directory, folder) => {
  const platform = getPlatform()
  const server = getServerConnection()
  const queryClient = new QueryClient()
  try {
    setRuntimeServerConnection({
      url: "http://127.0.0.1:43210",
      username: "buddy",
      password: "fixture-password",
      isEmbeddedBackend: true,
    })
    for (const name of ["allow-list-book.epub", "scripted-chapter.epub"]) {
      const bytes = await Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).arrayBuffer()
      setRuntimePlatform({
        ...platform,
        fetch: withFetchPreconnect(
          async (input, init) => {
            const request = new Request(input, init)
            const url = new URL(request.url)
            expect(url.origin).toBe("http://127.0.0.1:43210")
            expect(url.pathname).toBe(`/api/file/raw/${name}`)
            expect(url.searchParams.get("path")).toBe(`books/éditions/${name}`)
            expect(request.headers.get("x-buddy-directory")).toBe(encodeURIComponent(directory))
            expect(request.headers.get("authorization")).toBe(
              `Basic ${btoa("buddy:fixture-password")}`,
            )
            return new Response(bytes, { headers: { "content-type": "application/epub+zip" } })
          },
          fetch,
        ),
      })
      const blob = await queryClient.fetchQuery(
        readingResourceBlobQueryOptions(directory, `${folder}/${name}`),
      )
      const input = toFoliateInput({ kind: "blob", blob, name })
      expect(input).toBeInstanceOf(File)
      if (!(input instanceof File)) throw new Error("Sources must provide a File to Foliate")
      expect(await input.arrayBuffer()).toEqual(bytes)
      const view = new View()
      try {
        expect(await openFoliateBook(view, input)).toEqual({ status: "opened" })
        const chapter = view.book.sections[0]
        if (!chapter) throw new Error("Sources EPUB has no readable chapter")
        const chapterBlob = blobs.get(await chapter.load())
        if (!chapterBlob) throw new Error("Sources EPUB did not produce a chapter blob")
        const doc = new DOMParser().parseFromString(
          await chapterBlob.text(),
          "application/xhtml+xml",
        )
        expect(doc.querySelector("script")).toBeNull()
        expect(doc.body.textContent?.trim().length).toBeGreaterThan(0)
      } finally {
        await view.book?.destroy?.()
        view.remove()
      }
    }
  } finally {
    queryClient.clear()
    setRuntimePlatform(platform)
    setRuntimeServerConnection(server)
  }
})

test("Buddy's real Foliate integration strips executable EPUB content before chapter blobs are made", async () => {
  const fixture = await Bun.file(
    new URL("./fixtures/scripted-chapter.epub", import.meta.url),
  ).arrayBuffer()
  const file = new File([fixture], "scripted-chapter.epub", { type: "application/epub+zip" })
  const view = new View()
  try {
    expect(await openFoliateBook(view, file)).toEqual({ status: "opened" })
    const chapter = view.book.sections[0]
    if (!chapter) throw new Error("Fixture chapter was not loaded")
    const blob = blobs.get(await chapter.load())
    if (!blob) throw new Error("Foliate did not create the chapter blob")
    expect(blob.type).toBe("application/xhtml+xml")
    const doc = new DOMParser().parseFromString(await blob.text(), "application/xhtml+xml")
    expect(doc.querySelector("script")).toBeNull()
    expect(doc.querySelector("body")?.hasAttribute("onload")).toBe(false)
    expect(doc.querySelector("a")?.hasAttribute("href")).toBe(false)
    expect(doc.querySelector("h1")?.textContent).toBe("Chapter text")
    const meta = doc.querySelector("head")?.firstElementChild
    expect(meta?.getAttribute("http-equiv")).toBe("Content-Security-Policy")
    expect(meta?.getAttribute("content")).toBe(
      "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'",
    )

    const xmlChapter = view.book.sections[1]
    if (!xmlChapter) throw new Error("Fixture XML chapter was not loaded")
    const xmlBlob = blobs.get(await xmlChapter.load())
    if (!xmlBlob) throw new Error("Foliate did not create the XML chapter blob")
    expect(xmlBlob.type).toBe("application/xhtml+xml")
    const xml = await xmlBlob.text()
    expect(xml).not.toContain("bookScriptSentinel")
    expect(xml).not.toContain("XML chapter")
  } finally {
    await view.book?.destroy?.()
    view.remove()
  }
})

test("CBZ pages keep archive content in an image instead of a runnable document", async () => {
  const fixture = await Bun.file(
    new URL("./fixtures/image-only.cbz", import.meta.url),
  ).arrayBuffer()
  const view = new View()
  try {
    expect(await openFoliateBook(view, new File([fixture], "image-only.cbz"))).toEqual({
      status: "opened",
    })
    const chapter = view.book.sections[0]
    if (!chapter) throw new Error("CBZ image page was not loaded")
    const page = blobs.get(await chapter.load())
    if (!page) throw new Error("Foliate did not create a CBZ page")
    expect(page.type).toBe("text/html")
    const doc = new DOMParser().parseFromString(await page.text(), "text/html")
    expect(doc.querySelector("script, iframe, object, embed")).toBeNull()
    expect(doc.body.children.length).toBe(1)
    const image = doc.body.firstElementChild
    expect(image?.localName).toBe("img")
    const src = image?.getAttribute("src")
    expect(src).toStartWith("blob:foliate-test/")
    const resource = src ? blobs.get(src) : undefined
    expect(await resource?.text()).toContain("<script>bad()</script>")
  } finally {
    await view.book?.destroy?.()
    view.remove()
  }
})

test("rejects executable FB2 content before it reaches the reader view", async () => {
  const source =
    '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>Unsafe link</book-title></title-info></description><body><section><p><a l:href="javascript:bad()">Link</a></p></section></body></FictionBook>'
  const view = new View()
  const result = await openFoliateBook(
    view,
    new File([source], "book.fb2", { type: "application/x-fictionbook+xml" }),
  )
  expect(result.status).toBe("error")
  if (result.status !== "error") throw new Error("FB2 must not open")
  expect(result.error.message).toBe("This book format cannot be opened safely. Use EPUB instead.")
  expect(view.book).toBeUndefined()
})

test("rejects a prebuilt non-EPUB book even when it exposes a resource transform hook", async () => {
  const view = new View()
  const result = await openFoliateBook(view, {
    sections: [{ load: () => "blob:unsafe-page" }],
    transformTarget: new EventTarget(),
  })
  expect(result.status).toBe("error")
  expect(view.book).toBeUndefined()
})

async function openFixtureBook(name: string) {
  const bytes = await Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).arrayBuffer()
  const view = new View()
  expect(await openFoliateBook(view, new File([bytes], name))).toEqual({ status: "opened" })
  return view
}

function openPublisherBook() {
  return openFixtureBook("allow-list-book.epub")
}

function elementStructure(doc: Document | undefined) {
  const elements = Array.from(doc?.getElementsByTagName("*") ?? [])
  return elements.map((element) => ({
    namespace: element.namespaceURI,
    name: element.localName,
    parent: element.parentElement ? elements.indexOf(element.parentElement) : -1,
  }))
}

function textStructure(doc: Document) {
  const elements = Array.from(doc.getElementsByTagName("*"))
  const walker = doc.createTreeWalker(
    doc.body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_CDATA_SECTION,
    {
      acceptNode: (node) =>
        node.nodeType === Node.ELEMENT_NODE
          ? ["script", "style"].includes(node.nodeName.toLowerCase())
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT,
    },
  )
  const nodes = []
  let offset = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ""
    nodes.push({
      parent: node.parentElement ? elements.indexOf(node.parentElement) : -1,
      index: node.parentNode
        ? Array.from(node.parentNode.childNodes).findIndex((child) => child === node)
        : -1,
      text,
      startOffset: offset,
      endOffset: offset + text.length,
    })
    offset += text.length
  }
  return nodes
}

async function chapterBlob(view: View, index: number) {
  const section = view.book.sections[index]
  if (!section) throw new Error(`Missing fixture section ${index}`)
  const blob = blobs.get(await section.load())
  if (!blob) throw new Error(`Missing displayed blob for section ${index}`)
  return blob
}

test("fixed-layout XML, XSL and unknown-type spine pages become empty XHTML pages", async () => {
  const view = await openPublisherBook()
  try {
    expect(view.isFixedLayout).toBe(true)
    for (const index of [2, 3, 4, 5, 6]) {
      const blob = await chapterBlob(view, index)
      expect(blob.type).toBe("application/xhtml+xml")
      const doc = new DOMParser().parseFromString(await blob.text(), "application/xhtml+xml")
      expect(doc.querySelector("parsererror")).toBeNull()
      expect(doc.querySelector("body")?.textContent).toBe("")
      expect(doc.querySelector("meta")?.getAttribute("http-equiv")).toBe("Content-Security-Policy")
    }
  } finally {
    await view.book.destroy?.()
  }
})

test("an SVG fixed-layout page shows its raster image, drawing and text inline, at its own size, with the CSP", async () => {
  const view = await openPublisherBook()
  try {
    const blob = await chapterBlob(view, 1)
    expect(blob.type).toBe("application/xhtml+xml")
    const doc = new DOMParser().parseFromString(await blob.text(), "application/xhtml+xml")
    expect(doc.querySelector("parsererror")).toBeNull()
    const csp = doc.querySelector("head")?.firstElementChild
    expect(csp?.getAttribute("http-equiv")).toBe("Content-Security-Policy")
    expect(csp?.getAttribute("content")).toBe(CSP)
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(
      "width=600,height=800",
    )
    expect(doc.querySelector("img")).toBeNull()
    const svg = doc.querySelector("body")?.firstElementChild
    expect(svg?.namespaceURI).toBe(SVG)
    expect(svg?.localName).toBe("svg")
    expect(svg?.getAttribute("width")).toBe("600px")
    expect(svg?.getAttribute("height")).toBe("800px")
    expect(svg?.getAttribute("viewBox")).toBe("0 0 600 800")
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet")
    const drawing = Array.from(svg?.getElementsByTagNameNS(SVG, "*") ?? [])
    expect(drawing.map((element) => element.localName)).toEqual([
      "style",
      "defs",
      "linearGradient",
      "stop",
      "image",
      "rect",
      "text",
      "a",
      "text",
    ])
    const image = drawing.find((element) => element.localName === "image")
    const imageURL = image?.getAttribute("href") ?? image?.getAttributeNS(XLINK, "href")
    expect(imageURL).toStartWith("blob:foliate-test/")
    const raster = imageURL ? blobs.get(imageURL) : undefined
    expect(raster?.type).toBe("image/jpg")
    expect(await raster?.slice(0, 3).arrayBuffer()).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]).buffer,
    )
    expect(svg?.textContent).toContain("Page text")
    const cssURL = svg?.querySelector("style")?.textContent?.match(/url\("([^"]+)"\)/u)?.[1]
    expect(cssURL).toStartWith("blob:foliate-test/")
    expect(cssURL ? await blobs.get(cssURL)?.text() : undefined).toContain("font-family: Publisher")
    const font = Array.from(blobs.values()).find((value) => value.type === "font/woff2")
    expect(await font?.slice(0, 4).text()).toBe("wOF2")
    const source = await blob.text()
    expect(source).not.toContain("javascript:")
    expect(source).not.toContain("bad()")
    expect(source).not.toContain("Unsafe foreign content")
  } finally {
    await view.book.destroy?.()
  }
})

test("an HTML chapter keeps its DOCTYPE through the real Foliate loader", async () => {
  const view = await openPublisherBook()
  try {
    const blob = await chapterBlob(view, 7)
    expect(blob.type).toBe("text/html")
    expect(await blob.text()).toStartWith("<!DOCTYPE html>")
    const doc = new DOMParser().parseFromString(await blob.text(), "text/html")
    expect(doc.doctype?.name).toBe("html")
    expect(doc.querySelector("p")?.textContent).toBe("HTML chapter text")
    expect(doc.querySelector("script")).toBeNull()
    expect(doc.querySelector("head")?.firstElementChild?.getAttribute("content")).toBe(CSP)
  } finally {
    await view.book.destroy?.()
  }
})

test("a whole-book search creates no resource URLs and searches the same elements, text nodes and offsets that are displayed", async () => {
  for (const name of ["scripted-chapter.epub", "allow-list-book.epub"]) {
    const view = await openFixtureBook(name)
    try {
      const before = createdURLs
      const found = []
      for await (const result of view.search({ query: "text" })) {
        if (result !== "done" && "subitems" in result) found.push(result)
      }
      expect(found.length).toBeGreaterThan(0)
      expect(createdURLs).toBe(before)
      for (const [index, section] of view.book.sections.entries()) {
        const displayed = await chapterBlob(view, index)
        const shown = new DOMParser().parseFromString(
          await displayed.text(),
          displayed.type === "text/html" ? "text/html" : "application/xhtml+xml",
        )
        const searched = await section.createDocument?.()
        if (!searched) throw new Error(`Missing search document for section ${index}`)
        expect(elementStructure(searched)).toEqual(elementStructure(shown))
        expect(elementStructure(searched).length).toBeGreaterThan(3)
        expect(textStructure(searched)).toEqual(textStructure(shown))
      }
    } finally {
      await view.book.destroy?.()
    }
  }
})

test("refuses an already-created EPUB, including a cache populated before Buddy's opener", async () => {
  const bytes = await Bun.file(
    new URL("./fixtures/scripted-chapter.epub", import.meta.url),
  ).arrayBuffer()
  const book = await makeBook(new File([bytes], "scripted-chapter.epub"))
  try {
    const section = book.sections[0]
    if (!section) throw new Error("Missing preloaded section")
    expect(await blobs.get(await section.load())?.text()).toContain("<script>")
    const result = await openFoliateBook(new View(), book)
    expect(result.status).toBe("error")
  } finally {
    await book.destroy?.()
  }
})

test("publisher styles, images, SVG data images, fonts, links and footnotes survive, while XSL instructions are removed", async () => {
  const view = await openPublisherBook()
  try {
    const blob = await chapterBlob(view, 0)
    const source = await blob.text()
    expect(source).not.toContain("xml-stylesheet")
    const doc = new DOMParser().parseFromString(source, "application/xhtml+xml")
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(
      "width=600,height=800",
    )
    const cssURL = doc.querySelector('link[rel="stylesheet"]')?.getAttribute("href")
    expect(cssURL).toStartWith("blob:foliate-test/")
    const css = cssURL ? await blobs.get(cssURL)?.text() : undefined
    expect(css).toContain("@font-face")
    expect(css).toContain("font-family: Publisher")
    expect(Array.from(blobs.values()).some((value) => value.type === "font/woff2")).toBe(true)
    const font = Array.from(blobs.values()).find((value) => value.type === "font/woff2")
    expect(font?.size).toBeGreaterThan(1_000)
    expect(await font?.slice(0, 4).text()).toBe("wOF2")
    const alias = Array.from(blobs.values()).find(
      (value) => value.type === "application/x-font-woff",
    )
    expect(alias?.size).toBe(font?.size)
    if (!alias || !font) throw new Error("Missing fixture font")
    expect(
      Buffer.from(await alias.arrayBuffer()).equals(Buffer.from(await font.arrayBuffer())),
    ).toBe(true)
    const images = doc.querySelectorAll("img")
    expect(images.length).toBe(3)
    const raster = images[0]?.getAttribute("src")
    expect(raster ? blobs.get(raster)?.type : undefined).toBe("image/png")
    const svgURL = images[1]?.getAttribute("src")
    const svg = svgURL ? await blobs.get(svgURL)?.text() : undefined
    expect(svg).toContain("circle")
    expect(svg).not.toContain("bad()")
    expect(images[2]?.getAttribute("src")).toStartWith("data:image/svg+xml;base64,")
    expect(doc.querySelector("style")?.textContent).toContain("color: navy")
    expect(doc.querySelector(".note-reference")?.getAttribute("epub:type")).toBe("noteref")
    expect(doc.querySelector(".note-reference")?.getAttribute("href")).toBe("#note")
    expect(doc.querySelector("#note")?.getAttribute("epub:type")).toBe("footnote")
    expect(doc.querySelector("#note p")?.textContent).toBe("Footnote text")
    expect(doc.querySelector("#note a")?.getAttribute("href")).toBe("chapter.xhtml")
  } finally {
    await view.book.destroy?.()
  }
})

test("search CFIs highlight the correct displayed paragraph after a preceding body script is removed", async () => {
  const view = await openPublisherBook()
  try {
    const blob = await chapterBlob(view, 0)
    const display = new DOMParser().parseFromString(await blob.text(), "application/xhtml+xml")
    const search = await view.book.sections[0]?.createDocument?.()
    expect(search?.querySelectorAll("script").length).toBe(0)
    expect(elementStructure(search)).toEqual(elementStructure(display))
    const matches = []
    for await (const result of view.search({ query: "Search target", index: 0 })) {
      if (result !== "done" && "cfi" in result) matches.push(result)
    }
    expect(matches.length).toBe(1)
    const match = matches[0]
    if (!match) throw new Error("Search did not find the fixture paragraph")
    const resolved = await view.resolveNavigation(match.cfi)
    const highlight = resolved?.anchor?.(display)
    expect(highlight instanceof Range).toBe(true)
    if (!(highlight instanceof Range))
      throw new Error("Search result did not resolve to a highlight range")
    expect(highlight.toString()).toBe("Search target")
    expect(highlight.startContainer.parentElement?.textContent).toBe("Search target paragraph.")
  } finally {
    await view.book.destroy?.()
  }
})
