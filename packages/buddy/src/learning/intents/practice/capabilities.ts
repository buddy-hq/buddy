import {
  pedagogyDebugAttemptTool,
  pedagogyGuidedPracticeTool,
  pedagogyIndependentPracticeTool,
  pedagogyStepwiseSolveTool,
} from "../../capabilities/pedagogy/tools/definitions"
import { createIntentCapabilities } from "../capabilities/types"

export const PRACTICE_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "practice",
  tools: [
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
  ],
  skills: [],
})
