import { createIntentCapabilities } from "../capabilities/types"

export const LEARN_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "learn",
  tools: [
    "search_standards",
    "get_standard",
    "get_learning_components",
    "get_prerequisites",
    "get_next_standards",
    "get_crosswalk",
    "query_standards_sql",
    "pedagogy_prepare_resource",
    "pedagogy_resource_ingest_full_text",
    "render_mermaid",
  ],
  skills: [
    "explanation-playbook",
    "worked-example-playbook",
    "concept-contrast-playbook",
    "analogy-playbook",
    "reading-assistant-playbook",
  ],
})
