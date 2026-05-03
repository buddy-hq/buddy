import { registerBuddyTools } from "../../../runtime/register-buddy-tools"
import { teachingTools } from "./tools"

export async function ensureTeachingToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, teachingTools)
}
