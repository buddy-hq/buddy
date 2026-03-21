import { registerBuddyTools } from '@buddy/backend/learning/tools/register-buddy-tools'
import { figureTools } from './tools'

export async function ensureFigureToolsRegistered(directory: string): Promise<void> {
  await registerBuddyTools(directory, figureTools)
}
