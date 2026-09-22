import type { Citation } from "@buddy/citation-contract"

export type CitationSurfaceRevealer = (citation: Citation) => boolean | Promise<boolean>

const citationSurfaceRevealers = new Map<string, CitationSurfaceRevealer>()

export function registerCitationSurfaceRevealer(
  targetKey: string,
  revealer: CitationSurfaceRevealer,
): () => void {
  citationSurfaceRevealers.set(targetKey, revealer)
  return () => {
    if (citationSurfaceRevealers.get(targetKey) === revealer) {
      citationSurfaceRevealers.delete(targetKey)
    }
  }
}

export function citationSurfaceRevealer(targetKey: string): CitationSurfaceRevealer | undefined {
  return citationSurfaceRevealers.get(targetKey)
}
