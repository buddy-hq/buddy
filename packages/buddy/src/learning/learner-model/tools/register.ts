import { registerBuddyTools } from "../../tools/register-buddy-tools"
import { learnerTools } from "./tools"

export async function ensureLearnerToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, learnerTools)
}
