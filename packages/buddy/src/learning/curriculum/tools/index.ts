import { curriculumReadTool } from "./read.js"
import { curriculumUpdateTool } from "./update.js"

const curriculumTools = [
  curriculumReadTool,
  curriculumUpdateTool,
] as const

export { curriculumTools }
