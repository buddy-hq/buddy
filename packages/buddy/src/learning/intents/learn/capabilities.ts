import {
  getCrosswalkTool,
  getLearningComponentsTool,
  getNextStandardsTool,
  getPrerequisitesTool,
  getStandardTool,
  queryStandardsSqlTool,
  searchStandardsTool,
} from "../../knowledge-graph/tools"
import { pedagogyResourceIngestFullTextTool } from "../../capabilities/pedagogy/tools/definitions"
import { renderMermaidTool } from "../../capabilities/figures/mermaid/tools/render-mermaid"
import { createIntentCapabilities } from "../capabilities/types"

export const LEARN_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "learn",
  tools: [
    searchStandardsTool,
    getStandardTool,
    getLearningComponentsTool,
    getPrerequisitesTool,
    getNextStandardsTool,
    getCrosswalkTool,
    queryStandardsSqlTool,
    pedagogyResourceIngestFullTextTool,
    renderMermaidTool,
  ],
  skills: [
    "explanation-playbook",
    "worked-example-playbook",
    "concept-contrast-playbook",
    "analogy-playbook",
    "reading-assistant-playbook",
  ],
})
