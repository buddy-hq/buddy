export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdObject
  | readonly JsonLdValue[]

export type JsonLdObject = {
  readonly [key: string]: JsonLdValue
}

export type OpenGraphType = "article" | "website"
export type RobotsDirective = "index, follow" | "noindex, follow"

export type SeoPageProps = {
  readonly title?: string
  readonly description?: string
  readonly ogImagePath?: string
  readonly ogImageAlt?: string
  readonly ogType?: OpenGraphType
  readonly robots?: RobotsDirective
  readonly lastModified?: string
  readonly additionalJsonLd?: readonly JsonLdObject[]
}

export type FaqJsonLdItem = {
  readonly question: string
  readonly answer: string
}

/** FAQPage node for the @graph in SeoHead (no @context — graph owns that). */
export function buildFaqPageJsonLd(
  pageUrl: string,
  items: readonly FaqJsonLdItem[],
): JsonLdObject {
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }
}
