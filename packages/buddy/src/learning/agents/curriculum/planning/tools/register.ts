import { registerBuddyTools } from "../../../../shared"
import { curriculumTools } from "./tools"

export async function ensureCurriculumToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, curriculumTools)
}
