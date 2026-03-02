import { teachingTools } from "./index.js"
import { createToolRegistrar } from "../../shared/create-tool-registrar.js"

const ensureTeachingToolsRegistered = createToolRegistrar(teachingTools)

export { ensureTeachingToolsRegistered }
