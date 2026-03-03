import { goalTools } from "./index.js"
import { createToolRegistrar } from "../../shared/create-tool-registrar.js"

const ensureGoalToolsRegistered = createToolRegistrar(goalTools)

export { ensureGoalToolsRegistered }
