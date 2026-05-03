import { AdvancedMathRuntimeService } from "../../local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../../local-runtimes/standards/service"
import type { ToolConstraintSource } from "./tool-constraint-types"

export function toolMatchesRuntimeConstraints(tool: ToolConstraintSource): boolean {
  switch (tool.constraints?.runtime) {
    case "advanced-math":
      return AdvancedMathRuntimeService.isReady()
    case "standards":
      return StandardsRuntimeService.isReady()
    default:
      return true
  }
}
