import { createIntentCapabilities } from "../capabilities/types"

export const PRACTICE_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "practice",
  tools: [
    "search_standards",
    "get_standard",
    "get_learning_components",
    "get_prerequisites",
    "query_standards_sql",
    "pedagogy_guided_practice",
    "pedagogy_independent_practice",
    {
      tool: "pedagogy_debug_attempt",
      personas: ["code-buddy"],
      workspaceStates: ["interactive"],
    },
    {
      tool: "pedagogy_stepwise_solve",
      personas: ["math-buddy"],
    },
    "render_mermaid",
  ],
  skills: [],
})
