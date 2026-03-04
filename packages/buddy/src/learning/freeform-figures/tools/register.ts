import { freeformFigureTools } from "./index.js"
import { createToolRegistrar } from "../../shared/create-tool-registrar.js"

const ensureFreeformFigureToolsRegistered = createToolRegistrar(freeformFigureTools)

export { ensureFreeformFigureToolsRegistered }
