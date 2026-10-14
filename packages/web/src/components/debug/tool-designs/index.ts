import { PRESENT_BY_INTENT_DESIGN } from "./present-by-intent/design"
import { PRESENT_MERGE_DESIGN } from "./present-merge/design"
import type { RegisteredToolPrompt, ToolDesign } from "./model"

export const TOOL_DESIGNS: readonly ToolDesign[] = [PRESENT_MERGE_DESIGN, PRESENT_BY_INTENT_DESIGN]

export const TOOL_PROMPTS: readonly RegisteredToolPrompt[] = TOOL_DESIGNS.flatMap((design) =>
  design.tools.map((tool) => ({
    id: `${design.id}/${tool.id}`,
    design,
    tool,
  })),
)
