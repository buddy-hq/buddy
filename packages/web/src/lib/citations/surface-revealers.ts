import type { Citation } from "@buddy/citation-contract"
import type { BenchTarget } from "@/lib/bench-navigation"

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

const documentCitationSurfaces = new Map<string, { target: BenchTarget }[]>()

export function registerDocumentCitationSurface(path: string, target: BenchTarget): () => void {
  const registration = { target }
  documentCitationSurfaces.set(path, [...(documentCitationSurfaces.get(path) ?? []), registration])
  return () => {
    const remaining = (documentCitationSurfaces.get(path) ?? []).filter(
      (candidate) => candidate !== registration,
    )
    if (remaining.length > 0) documentCitationSurfaces.set(path, remaining)
    else documentCitationSurfaces.delete(path)
  }
}

export function documentCitationSurface(path: string): BenchTarget | undefined {
  return documentCitationSurfaces.get(path)?.at(-1)?.target
}
