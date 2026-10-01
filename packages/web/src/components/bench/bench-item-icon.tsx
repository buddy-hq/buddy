import { cn } from "@buddy/ui"
import { FileTypeIcon, createFileTypeIconElement } from "@/components/files/file-type-icon"
import { BrowserFaviconImage } from "@/components/bench/surfaces/browser/browser-favicon-image"
import { presentedFileName } from "@/components/objects/describe-object"
import { inAppBrowserFaviconImageSources } from "@/lib/in-app-browser-favicon"
import {
  BENCH_WORKSPACE_ROOT_NOTES,
  isBenchObjectKind,
  type BenchObjectKind,
  type BenchTabTarget,
} from "@/lib/bench-targets"
import type { NotebookSearchResult } from "@/state/notebook-search"
import type { PromptNotebookReferencePart } from "@/components/prompt/prompt-types"
import {
  useInAppBrowserTabsStore,
  type InAppBrowserTabRuntime,
} from "@/state/in-app-browser-tabs-store"
import {
  BENCH_BOARD_ART,
  BENCH_BROWSER_ART,
  BENCH_CHAT_ART,
  BENCH_CREATION_ART,
  BENCH_NOTE_ART,
  BENCH_PRACTICE_ART,
  BENCH_RESOURCE_ART,
} from "./bench-action-art"

/** What an item is drawn as, however it reached the screen: a tab, a search row, an @ mention. */
type BenchItemIconSubject =
  | { type: "chat" }
  | { type: "note" }
  | { type: "file"; path: string }
  | { type: "browser"; url: string; tabID?: string }
  | { type: "object"; kind: BenchObjectKind; title: string }

type BenchItemIconImage =
  | { type: "file"; fileName: string }
  | { type: "art"; src: string }
  | { type: "browser"; url: string; tabID?: string }

function objectArt(kind: BenchObjectKind): string {
  switch (kind) {
    case "resource":
      return BENCH_RESOURCE_ART
    case "whiteboard":
    case "mermaid":
      return BENCH_BOARD_ART
    case "question-set":
    case "flashcard-deck":
      return BENCH_PRACTICE_ART
    default:
      return BENCH_CREATION_ART
  }
}

/**
 * Files, and Media that presents a file, use the file-icon library; Browser pages use their
 * favicon; everything else uses its kind's artwork.
 */
function benchItemIconImage(subject: BenchItemIconSubject): BenchItemIconImage {
  if (subject.type === "browser") return subject
  if (subject.type === "chat") return { type: "art", src: BENCH_CHAT_ART }
  if (subject.type === "note") return { type: "art", src: BENCH_NOTE_ART }
  if (subject.type === "file") return { type: "file", fileName: subject.path }
  const fileName = presentedFileName(subject.kind, subject.title)
  return fileName ? { type: "file", fileName } : { type: "art", src: objectArt(subject.kind) }
}

/** A page with no tab of its own (history, a typed address) borrows the favicon a tab captured for it. */
function browserRuntimeFor(
  byTabID: Readonly<Record<string, InAppBrowserTabRuntime>>,
  image: { url: string; tabID?: string },
): InAppBrowserTabRuntime | undefined {
  if (image.tabID) return byTabID[image.tabID]
  return Object.values(byTabID).find(
    (tab) => tab.url === image.url && tab.favicon?.pageUrl === image.url,
  )
}

function browserFaviconSources(
  image: { url: string },
  runtime: InAppBrowserTabRuntime | undefined,
): readonly string[] {
  return inAppBrowserFaviconImageSources({
    capturedDataUrl: runtime?.favicon?.dataUrl ?? null,
    pageUrl: runtime?.url ?? image.url,
  })
}

/** A Bench tab's target; `title` is the tab's resolved title. */
export function benchTargetIconSubject(
  target: BenchTabTarget,
  title: string,
): BenchItemIconSubject {
  if (target.type === "session") return { type: "chat" }
  if (target.type === "browser") return { type: "browser", url: target.url, tabID: target.tabID }
  if (target.type === "workspace-file") {
    return target.root === BENCH_WORKSPACE_ROOT_NOTES
      ? { type: "note" }
      : { type: "file", path: target.path }
  }
  return { type: "object", kind: target.ref.kind, title }
}

/** A notebook search result, in the search pages and the composer's @ menu alike. */
export function searchResultIconSubject(result: NotebookSearchResult): BenchItemIconSubject {
  switch (result.target.type) {
    case "open-tab":
      return benchTargetIconSubject(result.target.target, result.title)
    case "thread":
      return { type: "chat" }
    case "note":
      return { type: "note" }
    case "file":
      return { type: "file", path: result.target.path }
    case "resource":
      return { type: "object", kind: "resource", title: result.title }
    case "object":
      return { type: "object", kind: result.target.kind, title: result.title }
  }
}

/** What a notebook reference stores so its chip can be drawn again after the message is sent. */
type NotebookReferenceIcon = Pick<PromptNotebookReferencePart, "kind" | "url">

export function notebookReferenceIcon(subject: BenchItemIconSubject): NotebookReferenceIcon {
  if (subject.type === "browser") return { kind: "browser", url: subject.url }
  return { kind: subject.type === "object" ? subject.kind : subject.type }
}

/** The subject a stored notebook reference draws; an unknown kind keeps its title's file mark. */
export function notebookReferenceIconSubject(
  reference: Pick<PromptNotebookReferencePart, "kind" | "title" | "url">,
): BenchItemIconSubject {
  if (reference.kind === "chat") return { type: "chat" }
  if (reference.kind === "note") return { type: "note" }
  if (reference.kind === "browser" && reference.url) return { type: "browser", url: reference.url }
  if (isBenchObjectKind(reference.kind))
    return { type: "object", kind: reference.kind, title: reference.title }
  return { type: "file", path: reference.title }
}

/** The one icon for an item, as React. {@link createBenchItemIconElement} is the DOM twin. */
export function BenchItemIcon(props: {
  subject: BenchItemIconSubject
  className?: string
  /** Artwork carries its own padding, so it may want a size step above the marks beside it. */
  artClassName?: string
}) {
  const image = benchItemIconImage(props.subject)
  const runtime = useInAppBrowserTabsStore((state) =>
    image.type === "browser" ? browserRuntimeFor(state.byTabID, image) : undefined,
  )
  const artClassName = props.artClassName ?? props.className
  if (image.type === "file")
    return <FileTypeIcon fileName={image.fileName} className={props.className} />
  if (image.type === "art")
    return <img src={image.src} alt="" className={artClassName} aria-hidden />
  return (
    <BrowserFaviconImage
      sources={browserFaviconSources(image, runtime)}
      fallback={<img src={BENCH_BROWSER_ART} alt="" className={artClassName} aria-hidden />}
      className={cn(props.className, "rounded-sm")}
    />
  )
}

/**
 * The same icon for imperative surfaces such as the composer's pills. File marks come from
 * {@link createFileTypeIconElement}, which keeps Markdown legible on a dark theme.
 */
export function createBenchItemIconElement(
  subject: BenchItemIconSubject,
  className?: string,
): HTMLElement | SVGElement {
  const image = benchItemIconImage(subject)
  if (image.type === "file") return createFileTypeIconElement(image.fileName, className)
  const img = document.createElement("img")
  img.alt = ""
  img.setAttribute("aria-hidden", "true")
  if (className) img.className = className
  if (image.type === "art") {
    img.src = image.src
    return img
  }
  // Favicons fail often (no /favicon.ico), so each error moves on to the next source, then the art.
  const sources = [
    ...browserFaviconSources(
      image,
      browserRuntimeFor(useInAppBrowserTabsStore.getState().byTabID, image),
    ),
    BENCH_BROWSER_ART,
  ]
  let attempt = 0
  img.src = sources[0] ?? BENCH_BROWSER_ART
  img.addEventListener("error", () => {
    attempt += 1
    const next = sources[attempt]
    if (next) img.src = next
  })
  if (className) img.classList.add("rounded-sm")
  return img
}
