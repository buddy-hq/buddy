import { createElement } from "react"
import { cn } from "@buddy/ui"

/**
 * Screen-mode class for Bench images: 90% max-width, rounded corners,
 * subtle border, vertical rhythm matching the prose spacing.
 */
export const MARKDOWN_BENCH_IMAGE_SCREEN_CLASS_NAME = [
  "max-w-[90%] rounded-lg border border-border-weaker-base",
  "h-auto object-contain",
  "my-4",
].join(" ")

type MarkdownBenchImageProps = {
  src: string
  alt?: string
  title?: string
  className?: string
}

/**
 * Shared image renderer for the Markdown Bench.
 *
 * Screen mode: 90% max-width, rounded corners, subtle border, vertical rhythm.
 * Print mode: full content-box width, no border/radius (ink-safe), same rhythm.
 *
 * The print constraints are also enforced by the scoped print theme CSS
 * (`markdown-bench-document-theme.ts`) via `data-component="markdown-bench-image"`
 * selectors, so images rendered through paths that don't use this component
 * still get print-safe sizing.
 */
export function MarkdownBenchImage(props: MarkdownBenchImageProps) {
  return createElement(
    "img",
    Object.assign(
      {
        "data-component": "markdown-bench-image",
        src: props.src,
        alt: props.alt ?? "",
        className: cn(MARKDOWN_BENCH_IMAGE_SCREEN_CLASS_NAME, props.className),
      },
      props.title ? { title: props.title } : undefined,
    ),
  )
}
