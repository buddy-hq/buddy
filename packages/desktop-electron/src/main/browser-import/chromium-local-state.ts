import type { BrowserImportSourceProfile } from "@buddy/browser-contract/browser-import"
import { z } from "zod"

const localStateProfiles = z.object({
  profile: z
    .object({
      info_cache: z.record(z.string(), z.object({ name: z.string().optional() })).optional(),
    })
    .optional(),
})

function parseLocalState<TOutput>(text: string, schema: z.ZodType<TOutput>): TOutput | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function isPlainDirectoryName(name: string): boolean {
  return (
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !/[\\/]/u.test(name) &&
    !name.includes("\u0000")
  )
}

export function parseChromiumLocalStateProfiles(
  text: string,
): readonly BrowserImportSourceProfile[] {
  const infoCache = parseLocalState(text, localStateProfiles)?.profile?.info_cache
  if (infoCache === undefined) return []
  return Object.entries(infoCache)
    .filter(([id]) => isPlainDirectoryName(id))
    .map(([id, info]) => ({ id, name: info.name?.trim() || id }))
}
