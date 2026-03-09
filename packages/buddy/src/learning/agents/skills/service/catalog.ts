import fsp from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { Config } from "@buddy/backend/config/config"
import type { InstalledSkillInfo, SkillLibraryEntry, SkillsCatalog } from "./contracts"
import { readOptionalString } from "./documents"
import { loadVisibleSkills } from "./discovery"
import { PLACEHOLDER_LIBRARY } from "./library"
import { managedLibraryRoot, managedSkillsRoot, managedSource, resolveSkillScope } from "./paths"
import { enabledAction, resolvePermissionSource, resolveSkillPermission, skillRuleset } from "./permissions"

async function readSkillMetadata(location: string) {
  const source = await fsp.readFile(location, "utf8").catch(() => undefined)
  if (!source) {
    return {
      examplePrompt: undefined,
    }
  }

  const parsed = matter(source)
  return {
    examplePrompt: readOptionalString(parsed.data["example_prompt"]),
  }
}

async function readInstalledSkillEntries(input: {
  directory: string
  refresh?: boolean
}): Promise<InstalledSkillInfo[]> {
  const [skills, config] = await Promise.all([
    loadVisibleSkills(input.directory, {
      refresh: input.refresh,
    }),
    Config.getGlobal(),
  ])

  const ruleset = skillRuleset(config)

  return Promise.all(
    skills
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (skill): Promise<InstalledSkillInfo> => {
        const scope = resolveSkillScope(skill.location)
        const permissionRule = resolveSkillPermission(skill.name, ruleset)
        const metadata = await readSkillMetadata(skill.location)
        const source = managedSource(skill.location)

        return {
          name: skill.name,
          description: skill.description,
          location: skill.location,
          directory: path.dirname(skill.location),
          content: skill.content,
          examplePrompt: metadata.examplePrompt,
          enabled: enabledAction(permissionRule.rule.action),
          permissionAction: permissionRule.rule.action,
          permissionSource: resolvePermissionSource({
            explicit: permissionRule.explicit,
            matchedPattern: permissionRule.rule.pattern,
            skillName: skill.name,
          }),
          source: source.source,
          scope,
          managed: source.managed,
          removable: source.removable,
          ...(source.libraryID ? { libraryID: source.libraryID } : {}),
        }
      }),
  )
}

async function readLibraryEntries(): Promise<SkillLibraryEntry[]> {
  return Promise.all(
    PLACEHOLDER_LIBRARY.map(async (entry): Promise<SkillLibraryEntry> => {
      const installedFile = path.join(managedLibraryRoot(), entry.id, "SKILL.md")
      const stats = await fsp.stat(installedFile).catch(() => undefined)

      return {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        summary: entry.summary,
        examplePrompt: entry.examplePrompt,
        installed: !!stats?.isFile(),
      }
    }),
  )
}

export async function listSkillsCatalog(
  directory: string,
  options?: {
    refresh?: boolean
  },
): Promise<SkillsCatalog> {
  const [installed, library] = await Promise.all([
    readInstalledSkillEntries({
      directory,
      refresh: options?.refresh,
    }),
    readLibraryEntries(),
  ])

  return {
    directory,
    managedRoot: managedSkillsRoot(),
    installed,
    library,
  }
}
