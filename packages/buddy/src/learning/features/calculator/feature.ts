import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { pythonCalculatorTool } from "./tools/python-calculator"

export const calculatorFeature = defineBuddyFeature({
  id: "calculator",
  tools: [pythonCalculatorTool],
  skills: [],
  subagents: [],
  surfaces: [],
})
