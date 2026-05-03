import { registerBuddyTools } from "@buddy/backend/learning/runtime/register-buddy-tools"
import { figureTools } from "./tools"

export async function ensureFigureToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, figureTools)
}
