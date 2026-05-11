import fsp from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { Config } from "@buddy/backend/config"
import type { InstalledSkillInfo, SkillsCatalog } from "./contracts"
import { readOptionalString } from "./documents"
import { loadVisibleSkills } from "./discovery"
import { listCatalogLibraryItems, reconcileWithdrawnLibrarySkills } from "./library"
import { managedSkillsRoot, managedSource, resolveSkillScope } from "./paths"
import {
  enabledAction,
  resolvePermissionSource,
  resolveSkillPermission,
  skillRuleset,
} from "./permissions"

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

async function toInstalledSkillInfo(input: {
  skill: Awaited<ReturnType<typeof loadVisibleSkills>>[number]
  ruleset: ReturnType<typeof skillRuleset>
}): Promise<InstalledSkillInfo> {
  const scope = resolveSkillScope(input.skill.location)
  const permissionRule = resolveSkillPermission(input.skill.name, input.ruleset)
  const metadata = await readSkillMetadata(input.skill.location)
  const source = managedSource(input.skill.location)

  return {
    name: input.skill.name,
    description: input.skill.description,
    location: input.skill.location,
    directory: path.dirname(input.skill.location),
    content: input.skill.content,
    examplePrompt: metadata.examplePrompt,
    enabled: enabledAction(permissionRule.rule.action),
    permissionAction: permissionRule.rule.action,
    permissionSource: resolvePermissionSource({
      explicit: permissionRule.explicit,
      matchedPattern: permissionRule.rule.pattern,
      skillName: input.skill.name,
    }),
    source: source.source,
    scope,
    managed: source.managed,
    removable: source.removable,
    ...(source.libraryID ? { libraryID: source.libraryID } : {}),
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

  const sortedSkills = skills.slice().toSorted((left, right) => left.name.localeCompare(right.name))

  return Promise.all(
    sortedSkills.map((skill) =>
      toInstalledSkillInfo({
        skill,
        ruleset,
      }),
    ),
  )
}

async function readCuratedLibraryEntries() {
  const entries = await listCatalogLibraryItems()
  return {
    entries,
  }
}

export async function listSkillsCatalog(
  directory: string,
  options?: {
    refresh?: boolean
  },
): Promise<SkillsCatalog> {
  await reconcileWithdrawnLibrarySkills()

  const [installed, library, globalConfig] = await Promise.all([
    readInstalledSkillEntries({
      directory,
      refresh: options?.refresh,
    }),
    readCuratedLibraryEntries(),
    Config.getGlobal(),
  ])

  return {
    directory,
    managedRoot: managedSkillsRoot(),
    externalVendorRootsEnabled: globalConfig.skills_external_vendor_roots_enabled === true,
    installed,
    library: library.entries,
  }
}
