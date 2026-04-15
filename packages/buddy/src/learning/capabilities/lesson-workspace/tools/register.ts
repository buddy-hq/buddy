import { registerBuddyTools } from "../../../tools/register-buddy-tools"
import { teachingTools } from "./tools"

export async function ensureTeachingToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, teachingTools)
}
