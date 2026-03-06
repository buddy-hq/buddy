import { createToolRegistrar } from "../../shared/create-tool-registrar.js"
import { assessmentRecordTool, learnerStateQueryTool, practiceRecordTool } from "./index.js"

export const ensureLearnerToolsRegistered = createToolRegistrar([
  learnerStateQueryTool,
  practiceRecordTool,
  assessmentRecordTool,
])
