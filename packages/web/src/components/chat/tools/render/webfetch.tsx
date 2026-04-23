import { BasicTool } from "../../tools/basic-tool"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { readString } from "../../tools/types"
import type { ToolPartProps } from "../registry"

export function renderWebfetchTool({ state, info }: ToolPartProps) {
  const link = readString(state.input.url)
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      hideDetails
    >
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm text-text-interactive-base underline-offset-2 hover:underline"
        >
          {link}
        </a>
      ) : null}
      {state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
    </BasicTool>
  )
}
