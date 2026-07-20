import type { APIRoute } from "astro"
import { getCompareEntries, getCompareUrl } from "../lib/compare"
import { buildLlmsTxt } from "../lib/llms-txt"

export const prerender = true

export const GET: APIRoute = async () => {
  const compareEntries = await getCompareEntries()
  const compareLinks = compareEntries.map((entry) => ({
    title: entry.data.headline,
    tagline: entry.data.tagline,
    url: getCompareUrl(entry.id),
  }))
  const body = buildLlmsTxt(compareLinks)
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": 'inline; filename="llms.txt"',
    },
  })
}
