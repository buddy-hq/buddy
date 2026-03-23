import { pedagogyResourceIngestFullTextTool } from "../../capabilities/pedagogy/tools/definitions"
import { createIntentCapabilities } from "../capabilities/types"

export const LEARN_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "learn",
  tools: [pedagogyResourceIngestFullTextTool],
  skills: [
    "explanation-playbook",
    "worked-example-playbook",
    "concept-contrast-playbook",
    "analogy-playbook",
    "reading-assistant-playbook",
  ],
})
