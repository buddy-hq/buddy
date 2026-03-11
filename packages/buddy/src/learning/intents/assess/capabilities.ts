import {
  pedagogyMasteryCheckTool,
  pedagogyReflectionTool,
  pedagogyRetrievalCheckTool,
  pedagogyTransferCheckTool,
} from "../../capabilities/pedagogy/tools/definitions"
import { createIntentCapabilities } from "../capabilities/types"

export const ASSESS_INTENT_CAPABILITY_MANIFEST = createIntentCapabilities({
  intent: "assess",
  tools: [
    pedagogyMasteryCheckTool,
    pedagogyReflectionTool,
    pedagogyRetrievalCheckTool,
    pedagogyTransferCheckTool,
  ],
  skills: [],
})
