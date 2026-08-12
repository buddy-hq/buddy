declare module "foliate-js/view.js" {
  export type FoliateNavigationTarget = string | number | { fraction: number }
  export type FoliateResolvedNavigation = {
    index: number
    anchor?: (doc: Document) => Element | Range | null
  }

  export type FoliateLocalizedText = string | Record<string, string>

  export type FoliateContributor =
    | string
    | {
        name?: FoliateLocalizedText
      }

  export type FoliateMetadata = {
    title?: FoliateLocalizedText
    author?: FoliateContributor | FoliateContributor[]
    contributor?: FoliateContributor | FoliateContributor[]
    description?: FoliateLocalizedText
    language?: FoliateLocalizedText
    publisher?: FoliateLocalizedText
    subject?: FoliateLocalizedText | FoliateLocalizedText[]
    identifier?: FoliateLocalizedText
    source?: FoliateLocalizedText
    rights?: FoliateLocalizedText
  } & Record<string, unknown>

  export type FoliateTocItem = {
    label: string
    href: string
    subitems?: FoliateTocItem[] | null
  }

  export type FoliateSection = {
    id?: string | number
    linear?: string
    cfi?: string
    size?: number
    mediaOverlay?: unknown
    load: () => Promise<string> | string
    unload?: () => void
    createDocument?: () => Promise<Document> | Document
  }

  export type FoliateBook = {
    sections: FoliateSection[]
    dir?: "ltr" | "rtl"
    toc?: FoliateTocItem[] | null
    pageList?: FoliateTocItem[] | null
    landmarks?: Array<{ href: string; label?: string; type?: string[] }>
    metadata?: FoliateMetadata
    rendition?: {
      layout?: string
      spread?: string
      viewport?: string | { width: number; height: number }
    }
    media?: {
      activeClass?: string
      playbackActiveClass?: string
    }
    resolveHref?: (href: string) =>
      | Promise<{ index: number; anchor?: (doc: Document) => Element | Range | null }>
      | {
          index: number
          anchor?: (doc: Document) => Element | Range | null
        }
    resolveCFI?: (cfi: string) =>
      | Promise<{ index: number; anchor?: (doc: Document) => Element | Range | null }>
      | {
          index: number
          anchor?: (doc: Document) => Element | Range | null
        }
    splitTOCHref?: (
      href: string,
    ) => Promise<[string | number, unknown]> | [string | number, unknown]
    getTOCFragment?: (doc: Document, id: unknown) => Node | null
    isExternal?: (href: string) => boolean
    getCover?: () => Promise<Blob | null> | Blob | null
    getMediaOverlay?: () => EventTarget
    getCalibreBookmarks?: () => Promise<unknown[] | null> | unknown[] | null
    destroy?: () => void | Promise<void>
    transformTarget?: EventTarget
  }

  export type FoliateRenderer = HTMLElement & {
    heads?: HTMLElement[] | null
    feet?: HTMLElement[] | null
    start?: number
    end?: number
    viewSize?: number
    open: (book: FoliateBook) => void
    setStyles?: (styles: string | [string, string]) => void
    prev: (distance?: number) => Promise<void>
    next: (distance?: number) => Promise<void>
    goTo: (target: unknown) => Promise<void>
    getContents: () => Array<{
      index?: number
      doc: Document
      overlayer?: import("foliate-js/overlayer.js").Overlayer
    }>
  }

  export type FoliateRelocationDetail = {
    fraction?: number
    index?: number
    range?: Range | null
    cfi?: string
    location?: {
      current?: number
      total?: number
      next?: number
    }
    tocItem?: FoliateTocItem | null
    pageItem?: FoliateTocItem | null
  }

  export type FoliateSearchExcerpt = {
    pre: string
    match: string
    post: string
  }

  export type FoliateSearchHit = {
    cfi: string
    excerpt: FoliateSearchExcerpt
  }

  export type FoliateSearchResult =
    | "done"
    | { progress: number }
    | { cfi: string; excerpt: FoliateSearchExcerpt }
    | { label?: string; subitems: FoliateSearchHit[] }

  export type FoliateSearchOptions = {
    query: string
    index?: number | null
    matchCase?: boolean
    matchDiacritics?: boolean
    matchWholeWords?: boolean
    defaultLocale?: string
  }

  export type FoliateHistory = EventTarget & {
    back: () => void
    forward: () => void
    clear: () => void
    canGoBack: boolean
    canGoForward: boolean
    addEventListener(
      type: "index-change",
      listener: (event: Event) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "index-change",
      listener: (event: Event) => void,
      options?: boolean | EventListenerOptions,
    ): void
  }

  export type FoliateAnnotationPayload = {
    value: string
    color?: string
    text?: string
    note?: string
    created?: string
    modified?: string
    style?: string
  } & Record<string, unknown>

  export type FoliateDrawAnnotationEventDetail = {
    draw: (
      painter: (rects: DOMRectList, options?: Record<string, unknown>) => SVGElement,
      options?: Record<string, unknown>,
    ) => void
    annotation: FoliateAnnotationPayload
    doc: Document
    range: Range
  }

  export class View extends HTMLElement {
    book: FoliateBook
    renderer: FoliateRenderer
    history: FoliateHistory
    isFixedLayout: boolean
    lastLocation?: FoliateRelocationDetail
    tts?: {
      from: (range: Range) => string
    } | null
    mediaOverlay?: {
      start: (index: number) => Promise<void>
    } | null
    open(input: string | Blob | File | FoliateBook): Promise<void>
    init(options?: {
      lastLocation?: FoliateNavigationTarget
      showTextStart?: boolean
    }): Promise<void>
    close(): void
    getCFI(index: number, range?: Range): string
    getProgressOf(
      index: number,
      range?: Range,
    ): {
      tocItem?: FoliateTocItem | null
      pageItem?: FoliateTocItem | null
    }
    getTOCItemOf(target: FoliateNavigationTarget): Promise<FoliateTocItem | undefined>
    resolveNavigation(
      target: FoliateNavigationTarget,
    ): FoliateResolvedNavigation | Promise<FoliateResolvedNavigation | undefined>
    goTo(target: FoliateNavigationTarget): Promise<FoliateResolvedNavigation | undefined>
    goToFraction(fraction: number): Promise<void>
    select(target: FoliateNavigationTarget): Promise<void>
    deselect(): void
    prev(distance?: number): Promise<void>
    next(distance?: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    getSectionFractions(): number[]
    addAnnotation(
      annotation: FoliateAnnotationPayload,
      remove?: boolean,
    ): Promise<{ index: number; label: string } | undefined>
    deleteAnnotation(
      annotation: FoliateAnnotationPayload,
    ): Promise<{ index: number; label: string } | undefined>
    showAnnotation(annotation: FoliateAnnotationPayload): Promise<void>
    search(options: FoliateSearchOptions): AsyncGenerator<FoliateSearchResult>
    clearSearch(): void
    initTTS(granularity?: "word" | "sentence" | "grapheme"): Promise<void>
    startMediaOverlay(): Promise<void>
    addEventListener(
      type: "relocate",
      listener: (event: CustomEvent<FoliateRelocationDetail>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "relocate",
      listener: (event: CustomEvent<FoliateRelocationDetail>) => void,
      options?: boolean | EventListenerOptions,
    ): void
    addEventListener(
      type: "load",
      listener: (event: CustomEvent<{ doc: Document; index: number }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "load",
      listener: (event: CustomEvent<{ doc: Document; index: number }>) => void,
      options?: boolean | EventListenerOptions,
    ): void
    addEventListener(
      type: "external-link",
      listener: (event: CustomEvent<{ href: string }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "external-link",
      listener: (event: CustomEvent<{ href: string }>) => void,
      options?: boolean | EventListenerOptions,
    ): void
    addEventListener(
      type: "show-annotation",
      listener: (event: CustomEvent<{ value: string; index: number; range: Range }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "show-annotation",
      listener: (event: CustomEvent<{ value: string; index: number; range: Range }>) => void,
      options?: boolean | EventListenerOptions,
    ): void
    addEventListener(
      type: "draw-annotation",
      listener: (event: CustomEvent<FoliateDrawAnnotationEventDetail>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "draw-annotation",
      listener: (event: CustomEvent<FoliateDrawAnnotationEventDetail>) => void,
      options?: boolean | EventListenerOptions,
    ): void
    addEventListener(
      type: "create-overlay",
      listener: (event: CustomEvent<{ index: number }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "create-overlay",
      listener: (event: CustomEvent<{ index: number }>) => void,
      options?: boolean | EventListenerOptions,
    ): void
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ): void
  }

  export class ResponseError extends Error {}
  export class NotFoundError extends Error {}
  export class UnsupportedTypeError extends Error {}
}

declare module "foliate-js/overlayer.js" {
  export class Overlayer {
    element: SVGSVGElement
    add(
      key: string,
      range: Range,
      draw: (rects: DOMRectList, options?: Record<string, unknown>) => SVGElement,
      options?: Record<string, unknown>,
    ): void
    remove(key: string): void
    redraw(): void
    hitTest(point: { x: number; y: number }): [string | undefined, Range | undefined]
  }
}
