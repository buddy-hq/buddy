import { registerBuddyTools } from "@buddy/backend/learning/runtime/register-buddy-tools"
import { freeformFigureTools } from "./tools"

export async function ensureFreeformFigureToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, freeformFigureTools)
}
