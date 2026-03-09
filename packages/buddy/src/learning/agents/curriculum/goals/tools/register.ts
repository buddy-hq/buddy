import { registerBuddyTools } from "../../../../shared"
import { goalTools } from "./tools"

export async function ensureGoalToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, goalTools)
}
