import { syncOpenCodeProjectConfig } from "../../../config/runtime/opencode-sync"
import { getOpenCodeClient } from "../../../opencode-runtime/client"
import { SkillServiceError, type OpenCodeSkill } from "./contracts"
import { isSuppressedOpenCodeSkill } from "../../../opencode-runtime/hidden-opencode-skills"

export async function loadVisibleSkills(directory: string, _options?: { refresh?: boolean }): Promise<OpenCodeSkill[]> {
  try {
    await syncOpenCodeProjectConfig(directory)
    const { data } = await (await getOpenCodeClient()).skill.list({ location: { directory } })
    return data.filter((skill) => !isSuppressedOpenCodeSkill(skill)).map((skill) => ({ name: skill.name, description: skill.description ?? "", location: skill.path, content: skill.content }))
  } catch (cause) {
    if (cause instanceof SkillServiceError) throw cause
    throw new SkillServiceError("upstream_failure", "Failed to load notebook skills")
  }
}

export async function resolveInstalledSkillByName(name: string, directory: string) {
  return (await loadVisibleSkills(directory, { refresh: true })).find((skill) => skill.name === name)
}
