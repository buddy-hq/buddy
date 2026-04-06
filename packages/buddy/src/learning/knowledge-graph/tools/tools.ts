import { getCrosswalkTool } from "./get-crosswalk"
import { getLearningComponentsTool } from "./get-learning-components"
import { getNextStandardsTool } from "./get-next-standards"
import { getPrerequisitesTool } from "./get-prerequisites"
import { getStandardTool } from "./get-standard"
import { queryStandardsSqlTool } from "./query-standards-sql"
import { searchStandardsTool } from "./search-standards"

export const knowledgeGraphTools = [
  searchStandardsTool,
  getStandardTool,
  getLearningComponentsTool,
  getPrerequisitesTool,
  getNextStandardsTool,
  getCrosswalkTool,
  queryStandardsSqlTool,
] as const
