import { registerBuddyTools } from "../../../tools/register-buddy-tools"
import { pedagogyTools } from "./tools"

export async function ensurePedagogyToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, pedagogyTools)
}
