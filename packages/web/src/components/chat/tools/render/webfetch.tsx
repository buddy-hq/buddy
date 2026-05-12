import { readString } from "../../tools/types"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

function hostnameFrom(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function renderWebfetchTool({ state, icon }: ToolPartProps) {
  const link = readString(state.input.url)
  const host = link ? hostnameFrom(link) : undefined

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>fetched</ToolRowAction>
      {host ? <ToolRowSubject>{host}</ToolRowSubject> : null}
    </ToolRow>
  )
}
