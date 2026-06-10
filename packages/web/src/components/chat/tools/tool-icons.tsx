import { createElement } from "react"
import { Boxes } from "lucide-react"

import type { ToolIconRenderer } from "./tool-registry-types"

export const SKILL_TOOL_ICON: ToolIconRenderer = (className) => createElement(Boxes, { className })
