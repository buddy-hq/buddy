import { ToolCardWithDetails, ToolOutputPanel } from "../shared/tool-card"
import { unwrapError } from "../shared/utils"
import type { ToolPartProps } from "./registry"

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

function ExaSearchTool({ state, info, defaultOpen }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const links = extractUrls(output)
  const hasOutput = output.trim().length > 0

  return (
    <ToolCardWithDetails info={info} status={state.status} running={running} defaultOpen={defaultOpen}>
      {links.length > 0 ? (
        <div className="space-y-1">
          {links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm text-primary underline-offset-2 hover:underline"
            >
              {link}
            </a>
          ))}
        </div>
      ) : null}
      {state.status === "error" && hasOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </ToolCardWithDetails>
  )
}

export function WebsearchTool(props: ToolPartProps) {
  return <ExaSearchTool {...props} />
}

export function CodesearchTool(props: ToolPartProps) {
  return <ExaSearchTool {...props} />
}
