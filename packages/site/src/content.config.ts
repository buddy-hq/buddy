import { defineCollection } from "astro:content"
import { docsLoader } from "@astrojs/starlight/loaders"
import { docsSchema } from "@astrojs/starlight/schema"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

const COMPARE_TITLE_MAX_LENGTH = 60
const COMPARE_DESCRIPTION_MIN_LENGTH = 120
const COMPARE_DESCRIPTION_MAX_LENGTH = 160
const COMPARE_HEADLINE_MAX_LENGTH = 100
const COMPARE_TAGLINE_MAX_LENGTH = 180
const COMPARE_TARGET_QUERY_MIN_COUNT = 2
const COMPARE_FAQ_MIN_COUNT = 3
const COMPARE_FAQ_ANSWER_MIN_LENGTH = 40
const COMPARE_SECTION_MIN_COUNT = 3
const COMPARE_SECTION_MAX_COUNT = 6
const COMPARE_PARAGRAPH_MIN_LENGTH = 40
const COMPARE_DETAIL_MIN_LENGTH = 24

const compareHeading = z.string().trim().min(1).max(100)
const compareIntro = z.string().trim().min(COMPARE_PARAGRAPH_MIN_LENGTH).max(500)
const compareDetail = z.string().trim().min(COMPARE_DETAIL_MIN_LENGTH).max(600)

const proseSection = z.object({
  type: z.literal("prose"),
  paragraphs: z.array(z.string().trim().min(COMPARE_PARAGRAPH_MIN_LENGTH).max(1_000)).min(2).max(6),
  bullets: z.array(compareDetail).min(2).max(6).optional(),
})

const snapshotSection = z.object({
  type: z.literal("snapshot"),
  heading: compareHeading,
  intro: compareIntro.optional(),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        buddy: compareDetail,
        competitor: compareDetail,
      }),
    )
    .min(3)
    .max(7),
})

const decisionFactorsSection = z.object({
  type: z.literal("decision-factors"),
  heading: compareHeading,
  intro: compareIntro.optional(),
  factors: z
    .array(
      z.object({
        heading: z.string().trim().min(1).max(80),
        explanation: compareDetail,
      }),
    )
    .min(2)
    .max(5),
})

const workflowTrack = z.object({
  label: z.string().trim().min(1).max(80),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        detail: compareDetail,
      }),
    )
    .min(2)
    .max(5),
})

const workflowSection = z.object({
  type: z.literal("workflow"),
  heading: compareHeading,
  intro: compareIntro.optional(),
  buddy: workflowTrack,
  competitor: workflowTrack,
})

const comparisonTableSection = z.object({
  type: z.literal("comparison-table"),
  heading: compareHeading,
  intro: compareIntro.optional(),
  rows: z
    .array(
      z.object({
        factor: z.string().trim().min(1).max(80),
        buddy: compareDetail,
        competitor: compareDetail,
      }),
    )
    .min(3)
    .max(8),
})

const testResultsSection = z.object({
  type: z.literal("test-results"),
  heading: compareHeading,
  intro: compareIntro,
  method: z.string().trim().min(COMPARE_PARAGRAPH_MIN_LENGTH).max(800),
  results: z
    .array(
      z.object({
        measure: z.string().trim().min(1).max(100),
        buddy: compareDetail,
        competitor: compareDetail,
      }),
    )
    .min(2)
    .max(6),
  caveat: compareDetail,
  visual: z
    .object({
      src: z
        .string()
        .trim()
        .regex(/^\/[a-z0-9/_-]+\.[a-z0-9]+$/i),
      alt: z.string().trim().min(1).max(180),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      caption: compareDetail,
    })
    .optional(),
})

const pricingSection = z.object({
  type: z.literal("pricing"),
  heading: compareHeading,
  intro: compareIntro,
  buddy: compareDetail,
  competitor: compareDetail,
})

const decisionSection = z.object({
  type: z.literal("decision"),
  heading: compareHeading,
  competitorHeading: z.string().trim().min(1).max(100),
  competitorReasons: z.array(compareDetail).min(1).max(5),
  buddyHeading: z.string().trim().min(1).max(100),
  buddyReasons: z.array(compareDetail).min(1).max(5),
})

const compareSection = z.discriminatedUnion("type", [
  proseSection,
  snapshotSection,
  decisionFactorsSection,
  workflowSection,
  comparisonTableSection,
  // evidence + limitations: not used on sales compare pages (honesty lives in decision + FAQs)
  testResultsSection,
  pricingSection,
  decisionSection,
])

const compares = defineCollection({
  loader: glob({ base: "./src/content/compares", pattern: "**/*.{yaml,yml}" }),
  schema: z
    .object({
      competitor: z.string().trim().min(1),
      competitorUrl: z.string().url(),
      audience: z.union([z.literal("learners"), z.literal("educators"), z.literal("both")]),
      title: z.string().trim().min(1).max(COMPARE_TITLE_MAX_LENGTH),
      description: z
        .string()
        .trim()
        .min(COMPARE_DESCRIPTION_MIN_LENGTH)
        .max(COMPARE_DESCRIPTION_MAX_LENGTH),
      headline: z.string().trim().min(1).max(COMPARE_HEADLINE_MAX_LENGTH),
      tagline: z.string().trim().min(1).max(COMPARE_TAGLINE_MAX_LENGTH),
      targetQueries: z.array(z.string().trim().min(1)).min(COMPARE_TARGET_QUERY_MIN_COUNT),
      lastVerified: z.coerce.date(),
      lastUpdated: z.coerce.date(),
      faqs: z
        .array(
          z.object({
            question: z.string().trim().min(1),
            answer: z.string().trim().min(COMPARE_FAQ_ANSWER_MIN_LENGTH),
          }),
        )
        .min(COMPARE_FAQ_MIN_COUNT),
      sections: z
        .array(compareSection)
        .min(COMPARE_SECTION_MIN_COUNT)
        .max(COMPARE_SECTION_MAX_COUNT),
      relatedCompares: z.array(z.string().trim().min(1)).default([]),
      ogImagePath: z.string().trim().min(1).optional(),
      ogImageAlt: z.string().trim().min(1).optional(),
    })
    .superRefine((metadata, context) => {
      if (Boolean(metadata.ogImagePath) !== Boolean(metadata.ogImageAlt)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ogImagePath and ogImageAlt must be supplied together.",
        })
      }

      const sectionTypes = metadata.sections.map((section) => section.type)
      if (new Set(sectionTypes).size !== sectionTypes.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each comparison section type may appear at most once.",
          path: ["sections"],
        })
      }

      const decisionCount = sectionTypes.filter((type) => type === "decision").length
      if (decisionCount !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every comparison must contain exactly one decision section.",
          path: ["sections"],
        })
      }
    }),
})

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  compares,
}
