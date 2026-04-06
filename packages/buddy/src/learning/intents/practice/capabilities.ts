import {
  pedagogyDebugAttemptTool,
  pedagogyGuidedPracticeTool,
  pedagogyIndependentPracticeTool,
  pedagogyStepwiseSolveTool,
} from "../../capabilities/pedagogy/tools/definitions"
import { renderMermaidTool } from "../../capabilities/figures/mermaid/tools/render-mermaid"
import {
  getLearningComponentsTool,
  getPrerequisitesTool,
  getStandardTool,
  queryStandardsSqlTool,
  searchStandardsTool,
} from "../../knowledge-graph/tools"
import { createIntentCapabilities } from "../capabilities/types"

export const PRACTICE_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "practice",
  tools: [
    searchStandardsTool,
    getStandardTool,
    getLearningComponentsTool,
    getPrerequisitesTool,
    queryStandardsSqlTool,
    pedagogyGuidedPracticeTool,
    pedagogyIndependentPracticeTool,
    {
      tool: pedagogyDebugAttemptTool,
      personas: ["code-buddy"],
      workspaceStates: ["interactive"],
    },
    {
      tool: pedagogyStepwiseSolveTool,
      personas: ["math-buddy"],
    },
    renderMermaidTool,
  ],
  skills: [],
})
