import { registerBuddyTools } from "@buddy/backend/learning/tools/register-buddy-tools"
import { flashcardTools } from "./tools"

export async function ensureFlashcardToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, flashcardTools)
}
