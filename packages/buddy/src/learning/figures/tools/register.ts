import { figureTools } from "./index.js"
import { createToolRegistrar } from "../../shared/create-tool-registrar.js"

const ensureFigureToolsRegistered = createToolRegistrar(figureTools)

export { ensureFigureToolsRegistered }
