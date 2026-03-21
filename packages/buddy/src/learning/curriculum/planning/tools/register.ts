import { registerBuddyTools } from '../../../tools'
import { curriculumTools } from './tools'

export async function ensureCurriculumToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, curriculumTools)
}
