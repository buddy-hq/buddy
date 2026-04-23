import { language } from "@/context/language"

type ToolEmptyStateProps = {
  label?: string
}

/**
 * Rendered when a tool completes successfully but produces no content.
 *
 * Without this, completed-but-empty tools are silently invisible —
 * the user can't tell if the tool ran or not.
 */
export function ToolEmptyState({ label }: ToolEmptyStateProps) {
  return (
    <div className="mt-1 text-xs text-text-weak/60">
      {label ?? language.t("chatTools.noOutput")}
    </div>
  )
}
