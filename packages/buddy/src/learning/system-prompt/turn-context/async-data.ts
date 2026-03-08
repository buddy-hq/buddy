import { loadBundledActivitySkills } from "../../runtime/activity-skills.js"
import { TeachingService } from "../../teaching/service.js"
import type { BuildTurnContextSectionsInput, TurnAsyncData } from "./types.js"

export async function loadTurnAsyncData(input: BuildTurnContextSectionsInput): Promise<TurnAsyncData> {
  const hasEditor = input.runtimeProfile.capabilityEnvelope.visibleSurfaces.includes("editor")

  const loadSkillsPromise = input.activityBundle
    ? loadBundledActivitySkills(input.activityBundle.skills)
    : Promise.resolve(undefined)

  const checkpointStatusPromise = input.teachingContext?.active && hasEditor
    ? TeachingService.status(input.directory, input.teachingContext.sessionID).catch(() => undefined)
    : Promise.resolve(undefined)

  const [loadedSkills, checkpointStatus] = await Promise.all([loadSkillsPromise, checkpointStatusPromise])
  return { loadedSkills, checkpointStatus }
}
