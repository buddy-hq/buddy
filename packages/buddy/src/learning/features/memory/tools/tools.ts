import { learnerMemorySearchTool } from "./search-memory"
import { learnerMemoryUpdateTool } from "./update-memory"

const learnerMemoryTools = [learnerMemorySearchTool, learnerMemoryUpdateTool] as const

export { learnerMemoryTools }
