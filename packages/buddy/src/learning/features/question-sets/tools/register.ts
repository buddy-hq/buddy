import { registerBuddyTools } from "@buddy/backend/learning/runtime/register-buddy-tools"
import { questionSetTools } from "./tools"

export async function ensureQuestionSetToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, questionSetTools)
}
