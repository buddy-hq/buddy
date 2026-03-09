import { registerBuddyTools } from "../../shared"
import { learnerTools } from "./tools"

export async function ensureLearnerToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, learnerTools)
}
