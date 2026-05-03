import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { searchStandardsTool } from "./tools/search-standards"
import { getStandardTool } from "./tools/get-standard"
import { getCrosswalkTool } from "./tools/get-crosswalk"
import { getLearningComponentsTool } from "./tools/get-learning-components"
import { getNextStandardsTool } from "./tools/get-next-standards"
import { getPrerequisitesTool } from "./tools/get-prerequisites"
import { queryStandardsSqlTool } from "./tools/query-standards-sql"

export const standardsFeature = defineBuddyFeature({
  id: "standards",
  tools: [
    searchStandardsTool,
    getStandardTool,
    getCrosswalkTool,
    getLearningComponentsTool,
    getNextStandardsTool,
    getPrerequisitesTool,
    queryStandardsSqlTool,
  ],
  skills: [],
  subagents: [],
  surfaces: [],
})
