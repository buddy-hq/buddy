import { curriculumTools } from "./index.js"
import { createToolRegistrar } from "../../shared/create-tool-registrar.js"

const ensureCurriculumToolsRegistered = createToolRegistrar(curriculumTools)

export { ensureCurriculumToolsRegistered }
