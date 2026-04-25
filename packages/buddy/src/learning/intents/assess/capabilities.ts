import { createIntentCapabilities } from "../capabilities/types"

export const ASSESS_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "assess",
  tools: [
    "search_standards",
    "get_standard",
    "get_learning_components",
    "query_standards_sql",
    "pedagogy_prepare_resource",
    "pedagogy_reflection",
    "render_mermaid",
  ],
  skills: [],
})
