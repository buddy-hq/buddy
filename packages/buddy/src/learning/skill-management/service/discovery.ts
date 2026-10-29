import { syncOpenCodeProjectConfig } from "../../../config/runtime/opencode-sync"
import { getAgentRuntime } from "../../../runtime/agent-runtime"
import { SkillServiceError, type OpenCodeSkill } from "./contracts"

export async function loadVisibleSkills(
  directory: string,
  _options?: { refresh?: boolean },
): Promise<OpenCodeSkill[]> {
  try {
    await syncOpenCodeProjectConfig(directory)
    const skills = await (await getAgentRuntime()).catalog.skills(directory)
    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description ?? "",
      location: skill.path,
      content: skill.content,
    }))
  } catch (cause) {
    if (cause instanceof SkillServiceError) throw cause
    throw new SkillServiceError("upstream_failure", "Failed to load notebook skills")
  }
}

export async function resolveInstalledSkillByName(name: string, directory: string) {
  return (await loadVisibleSkills(directory, { refresh: true })).find(
    (skill) => skill.name === name,
  )
}
