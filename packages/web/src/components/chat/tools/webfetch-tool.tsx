import { ToolHeader } from "../shared/tool-header"
import { readString } from "../shared/utils"
import type { ToolPartProps } from "./registry"

export function WebfetchTool({ state, info }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const link = readString(state.input.url)

  return (
    <div className="w-full rounded-lg border border-border bg-card p-3">
      <ToolHeader info={info} status={state.status} running={running} />
      {!running && link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-sm text-primary underline-offset-2 hover:underline"
        >
          {link}
        </a>
      ) : null}
    </div>
  )
}
