import { useState, type ReactNode } from "react"

/**
 * Tries favicon image sources in order and renders the fallback when each one fails.
 *
 * @param props.sources - URLs to try, typically a captured data URL then a same-origin `/favicon.ico`.
 * @param props.fallback - Glyph shown when every source is missing or errors.
 * @param props.className - Classes applied to the loaded image.
 */
export function BrowserFaviconImage(props: {
  readonly sources: readonly string[]
  readonly fallback: ReactNode
  readonly className: string
}) {
  return (
    <BrowserFaviconImageAttempt
      key={props.sources.join("\0")}
      sources={props.sources}
      fallback={props.fallback}
      className={props.className}
    />
  )
}

function BrowserFaviconImageAttempt(props: {
  readonly sources: readonly string[]
  readonly fallback: ReactNode
  readonly className: string
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const source = props.sources.find((candidate) => !failed.has(candidate))
  if (!source) return props.fallback
  return (
    <img
      src={source}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={props.className}
      onError={() => setFailed((current) => new Set(current).add(source))}
    />
  )
}
