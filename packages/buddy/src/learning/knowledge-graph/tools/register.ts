import { registerBuddyTools } from "../../tools/register-buddy-tools"
import { knowledgeGraphTools } from "./tools"

export async function ensureKnowledgeGraphToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, knowledgeGraphTools)
}
