declare module "foliate-js/view.js" {
  export function makeBook(input: string | Blob): Promise<FoliateBook>
}

declare module "foliate-js/epub.js" {
  export type EPUBManifestItem = {
    href: string
    mediaType: string
  }

  export class EPUB {
    constructor(loader: {
      loadText: (name: string) => Promise<string | null>
      loadBlob: (name: string) => Promise<Blob | null>
      getSize: (name: string) => number
    })
    sections: import("foliate-js/view.js").FoliateSection[]
    transformTarget?: EventTarget
    loadText: (name: string) => Promise<string | null> | null
    loadDocument: (item: EPUBManifestItem) => Promise<Document>
    destroy(): void
  }
}
