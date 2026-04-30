import { registerBuddyTools } from "../../tools/register-buddy-tools"
import { learnerMemoryTools } from "./tools"

async function ensureLearnerMemoryToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, learnerMemoryTools)
}

export { ensureLearnerMemoryToolsRegistered }
