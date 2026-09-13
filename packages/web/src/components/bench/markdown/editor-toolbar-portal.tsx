import { createContext, useContext } from "react"
import { createPortal } from "react-dom"
import { KitchenSinkToolbar } from "@mdxeditor/editor"
import { cn } from "@buddy/ui"
import { MDX_EDITOR_THEME_CLASS_NAME } from "@/components/bench/markdown/editor-styles"

export const MarkdownBenchToolbarContainerContext = createContext<HTMLElement | null>(null)

function MarkdownBenchAdvancedToolbarPortal(props: { container?: HTMLElement | null }) {
  if (!props.container) return null
  return createPortal(
    <div
      data-component="markdown-bench-advanced-toolbar"
      className={cn(
        "mdxeditor flex min-w-max items-center gap-1 px-1 [&_[data-toolbar-item]]:mx-0.5 [&_[role='separator']]:mx-2",
        MDX_EDITOR_THEME_CLASS_NAME,
      )}
    >
      <KitchenSinkToolbar />
    </div>,
    props.container,
  )
}

export function MarkdownBenchToolbarContents() {
  const container = useContext(MarkdownBenchToolbarContainerContext)
  return <MarkdownBenchAdvancedToolbarPortal container={container} />
}
