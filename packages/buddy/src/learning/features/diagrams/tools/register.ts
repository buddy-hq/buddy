import { registerBuddyTools } from "@buddy/backend/learning/runtime/register-buddy-tools"
import { mermaidTools } from "./tools"

export async function ensureMermaidToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, mermaidTools)
}
