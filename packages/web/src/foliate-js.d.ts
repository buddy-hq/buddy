declare module "foliate-js/view.js" {
  export type FoliateNavigationTarget = string | number | { fraction: number }

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
    landmarks?: Array<{ href: string; type: string }>
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
    setStyles?: (styles: string) => void
    prev: (distance?: number) => Promise<void>
    next: (distance?: number) => Promise<void>
    goTo: (target: unknown) => Promise<void>
  }

  export type FoliateRelocationDetail = {
    fraction?: number
    index?: number
    range?: Range
    cfi?: string
    location?: {
      current?: number
      total?: number
    }
    tocItem?: FoliateTocItem | null
    pageItem?: FoliateTocItem | null
  }

  export class View extends HTMLElement {
    book: FoliateBook
    renderer: FoliateRenderer
    history: EventTarget
    isFixedLayout: boolean
    lastLocation?: FoliateRelocationDetail
    open(input: string | Blob | File | FoliateBook): Promise<void>
    init(options?: {
      lastLocation?: FoliateNavigationTarget
      showTextStart?: boolean
    }): Promise<void>
    close(): void
    goTo(target: FoliateNavigationTarget): Promise<{ index: number } | undefined>
    goToFraction(fraction: number): Promise<void>
    prev(distance?: number): Promise<void>
    next(distance?: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    getSectionFractions(): number[]
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
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: "external-link",
      listener: (event: CustomEvent<{ href: string }>) => void,
      options?: boolean | EventListenerOptions,
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
