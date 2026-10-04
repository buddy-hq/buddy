import { InfoIcon } from "@/icons/app-icons"

export function MarkdownBenchFileInfo(props: { title: string }) {
  return (
    <div
      data-component="markdown-bench-file-info"
      role="status"
      aria-label="Markdown file information"
      className="flex min-w-0 max-w-[min(32rem,calc(100vw-3rem))] items-center gap-2 px-2 py-1"
    >
      <InfoIcon className="size-4 shrink-0 text-text-weak" aria-hidden />
      <span className="shrink-0 text-xs font-medium text-text-weaker">File</span>
      <span className="min-w-0 truncate text-sm font-medium text-text-strong" title={props.title}>
        {props.title}
      </span>
    </div>
  )
}

export function MarkdownBenchAdvancedToolbarSlot(props: {
  ref(element: HTMLDivElement | null): void
}) {
  return (
    <div
      ref={props.ref}
      role="toolbar"
      aria-label="Advanced Markdown editing tools"
      className="flex min-w-0 max-w-[min(72rem,calc(100vw-3rem))] items-center"
    />
  )
}

export function MarkdownBenchSaveError(props: { message: string }) {
  return (
    <div className="border-b border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-2 text-xs text-icon-critical-base">
      {props.message}
    </div>
  )
}
