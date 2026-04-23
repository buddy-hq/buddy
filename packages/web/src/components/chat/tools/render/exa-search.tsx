import { BasicTool } from "../../tools/basic-tool"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { ToolEmptyState } from "../../tools/tool-empty-state"
import type { ToolPartProps } from "../registry"

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/g

function extractUrls(text: string): string[] {
  const seen = new Set<string>()
  const matches = text.match(URL_PATTERN) ?? []
  const result: string[] = []

  for (const entry of matches) {
    const normalized = entry.replace(/[),.;:!?]+$/g, "")
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export function renderExaSearchTool({ state, defaultOpen, info }: ToolPartProps) {
  const output = state.output || (state.error ?? "")
  const links = extractUrls(output)
  const hasOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {links.length > 0 ? (
        <div className="space-y-1">
          {links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm text-text-interactive-base underline-offset-2 hover:underline"
            >
              {link}
            </a>
          ))}
        </div>
      ) : state.status === "completed" && !hasOutput ? (
        <ToolEmptyState label="No results found" />
      ) : null}
      {state.status === "error" && hasOutput ? <ToolErrorPanel error={output} /> : null}
    </BasicTool>
  )
}
