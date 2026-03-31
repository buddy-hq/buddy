import { BasicTool } from "../../shared"
import { language } from "@/context/language"
import { readString } from "../../shared/utils"
import type { ToolPartProps } from "../registry"

export function renderWebfetchTool({ state, info }: ToolPartProps) {
  const link = readString(state.input.url)

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
    </BasicTool>
  )
}
