import type {
  ToolActionIcon,
  ToolRendererToken,
} from "@buddy/opencode-adapter/tool-presentation"

import { toolIconsByToken, toolRenderersByToken } from "./built-in-tool-renderers"
import type { ToolIconRenderer, ToolRenderer } from "./tool-registry-types"

export function resolveToolRenderer(token: ToolRendererToken): ToolRenderer {
  return toolRenderersByToken[token]
}

export function resolveToolIcon(token: ToolActionIcon): ToolIconRenderer {
  return toolIconsByToken[token]
}
