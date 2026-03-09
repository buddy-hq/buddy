import { registerBuddyTools } from "../../../../shared"
import { teachingTools } from "./tools"

export async function ensureTeachingToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, teachingTools)
}
