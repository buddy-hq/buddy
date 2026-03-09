import { registerBuddyTools } from "../../../../shared"
import { activityTools } from "./tools"

export async function ensureActivityToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, activityTools)
}
