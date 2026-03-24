import {
  pedagogyMasteryCheckTool,
  pedagogyReflectionTool,
  pedagogyRetrievalCheckTool,
  pedagogyTransferCheckTool,
} from "../../capabilities/pedagogy/tools/definitions"
import { renderMermaidTool } from "../../capabilities/figures/mermaid/tools/render-mermaid"
import { createIntentCapabilities } from "../capabilities/types"

export const ASSESS_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "assess",
  tools: [
    pedagogyMasteryCheckTool,
    pedagogyReflectionTool,
    pedagogyRetrievalCheckTool,
    pedagogyTransferCheckTool,
    renderMermaidTool,
  ],
  skills: [],
})
