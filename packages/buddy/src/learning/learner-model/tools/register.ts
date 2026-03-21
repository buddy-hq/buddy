import { registerBuddyTools } from '../../tools'
import { learnerTools } from './tools'

export async function ensureLearnerToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, learnerTools)
}
