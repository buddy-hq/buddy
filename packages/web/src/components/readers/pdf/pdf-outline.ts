import { z } from "zod"

export type TPdfPageReference = {
  num: number
  gen: number
}

export type TPdfDestinationElement =
  | string
  | number
  | boolean
  | null
  | TPdfPageReference
  | readonly TPdfDestinationElement[]

export type TPdfExplicitDestination = readonly TPdfDestinationElement[]
export type TPdfDestination = string | TPdfExplicitDestination

export type TPdfOutlineValue = {
  title: string
  destination?: TPdfDestination
  href?: string
  items: TPdfOutlineValue[]
}

export const PdfPageReferenceSchema = z.object({
  num: z.number().int(),
  gen: z.number().int(),
})

export const PdfDestinationElementSchema: z.ZodType<TPdfDestinationElement> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    PdfPageReferenceSchema,
    z.array(PdfDestinationElementSchema),
  ]),
)

export const PdfDestinationSchema: z.ZodType<TPdfDestination> = z.union([
  z.string(),
  z.array(PdfDestinationElementSchema),
])

const PdfOutlineNodeSchema = z.object({
  title: z.string(),
  dest: z.unknown().nullish(),
  url: z.unknown().nullish(),
  items: z.unknown().nullish(),
})

export function parsePdfOutline<TValue>(value: TValue): TPdfOutlineValue[] {
  if (!Array.isArray(value)) return []
  const items: TPdfOutlineValue[] = []
  for (const entry of value) {
    const parsed = PdfOutlineNodeSchema.safeParse(entry)
    if (!parsed.success) continue
    const title = parsed.data.title.trim()
    if (!title) continue
    const destination = PdfDestinationSchema.safeParse(parsed.data.dest)
    const href = z.string().safeParse(parsed.data.url)
    items.push(
      Object.assign(
        {
          title,
          items: parsePdfOutline(parsed.data.items ?? []),
        },
        destination.success ? { destination: destination.data } : undefined,
        href.success && href.data.length > 0 ? { href: href.data } : undefined,
      ),
    )
  }
  return items
}
