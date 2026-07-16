import { createElement } from "react"
import { Wrench } from "@/icons/app-icons"
import { isBuddyCustomTool } from "../utils/tool"

import type { ParsedToolUiMetadata } from "./parse-tool-ui-metadata"
import { renderBuddyCustomTool } from "./render/buddy-custom"
import { renderGenericTool } from "./render/generic"
import { builtInTools } from "./built-in-tool-renderers"
import type { ToolIconRenderer, ToolRenderer, ToolSummary } from "./tool-registry-types"

const FALLBACK_ICON: ToolIconRenderer = (cn) => createElement(Wrench, { className: cn })

function resolveInlineCardRenderer(tool: string) {
  if (isBuddyCustomTool(tool) && tool !== "python_calculator") {
    return renderBuddyCustomTool
  }

  return renderGenericTool
}

export function resolveInlineToolRenderer(tool: string): ToolRenderer {
  const builtIn = builtInTools[tool]
  if (builtIn) {
    return builtIn
  }

  return {
    icon: FALLBACK_ICON,
    card: resolveInlineCardRenderer(tool),
  }
}

function createFallbackSummary(toolUi: ParsedToolUiMetadata | undefined): ToolSummary | undefined {
  if (toolUi?.presentation !== "hidden-summary") {
    return undefined
  }

  return {
    display: "row",
    pattern: "metadata",
  }
}

function resolveSummaryDefinition(
  tool: string,
  toolUi: ParsedToolUiMetadata | undefined,
): ToolSummary | undefined {
  const builtIn = builtInTools[tool]
  if (builtIn) {
    return builtIn.summary
  }

  return createFallbackSummary(toolUi)
}

export function resolveToolRenderer(
  tool: string,
  toolUi: ParsedToolUiMetadata | undefined,
): ToolRenderer {
  const inlineRenderer = resolveInlineToolRenderer(tool)

  return {
    ...inlineRenderer,
    summary: resolveSummaryDefinition(tool, toolUi),
  }
}
