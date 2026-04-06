import {
  pedagogyMasteryCheckTool,
  pedagogyReflectionTool,
  pedagogyRetrievalCheckTool,
  pedagogyTransferCheckTool,
} from "../../capabilities/pedagogy/tools/definitions"
import { renderMermaidTool } from "../../capabilities/figures/mermaid/tools/render-mermaid"
import {
  getLearningComponentsTool,
  getStandardTool,
  queryStandardsSqlTool,
  searchStandardsTool,
} from "../../knowledge-graph/tools"
import { createIntentCapabilities } from "../capabilities/types"

export const ASSESS_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "assess",
  tools: [
    searchStandardsTool,
    getStandardTool,
    getLearningComponentsTool,
    queryStandardsSqlTool,
    pedagogyMasteryCheckTool,
    pedagogyReflectionTool,
    pedagogyRetrievalCheckTool,
    pedagogyTransferCheckTool,
    renderMermaidTool,
  ],
  skills: [],
})
