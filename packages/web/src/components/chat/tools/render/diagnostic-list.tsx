import { language } from "@/context/language"

interface DiagnosticListProps {
  diagnostics: Array<{
    range: { start: { line: number; character: number } }
    message: string
    severity?: number
  }>
}

export function DiagnosticList({ diagnostics }: DiagnosticListProps) {
  if (diagnostics.length === 0) return null

  return (
    <div className="mt-2 flex flex-col gap-1 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2">
      {diagnostics.map((diagnostic) => (
        <div
          key={`${diagnostic.range.start.line}:${diagnostic.range.start.character}:${diagnostic.message}`}
          className="flex items-baseline gap-2 text-xs"
        >
          <span className="font-semibold uppercase tracking-wide text-icon-critical-base">
            {language.t("chatTools.toolCard.error")}
          </span>
          <span className="shrink-0 text-icon-critical-base/80">
            [{diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}]
          </span>
          <span className="text-icon-critical-base/90">{diagnostic.message}</span>
        </div>
      ))}
    </div>
  )
}
