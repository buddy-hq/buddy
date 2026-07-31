import fsp from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { Config } from "@buddy/backend/config"
import type {
  InstalledSkillInfo,
  OpenCodeSkill,
  SkillPresentationInfo,
  SkillsCatalog,
} from "./contracts"
import { readOptionalString } from "./documents"
import { loadVisibleSkills } from "./discovery"
import {
  catalogIconRoutePathsByID,
  listCatalogLibraryItems,
  readSkillCatalogSnapshot,
  reconcileWithdrawnLibrarySkills,
  type SkillCatalogDocument,
} from "./library"
import {
  loadBuddySkillManifest,
  resolveSkillPresentation,
  type ResolvedSkillPresentation,
} from "./manifests"
import { managedSkillsRoot, managedSource, resolveSkillScope } from "./paths"
import {
  enabledAction,
  resolvePermissionSource,
  resolveSkillPermission,
  skillRuleset,
} from "./permissions"
import { refreshSkillArtifacts } from "./artifact-refresh"

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

/**
 * How a skill presents itself, wherever it is shown. A bundled skill names its
 * artwork in its manifest; a curated one carries the catalog's, addressed by the
 * verified-icon route. Resolving both here keeps a skill looking like the same
 * object in the drawer, the slash menu, and the composer.
 */
async function resolveSkillDisplay(input: {
  skill: OpenCodeSkill
  source: ReturnType<typeof managedSource>
  catalogIcons: ReadonlyMap<string, string>
}): Promise<ResolvedSkillPresentation> {
  const manifest =
    input.source.source === "system"
      ? await loadBuddySkillManifest(path.dirname(input.skill.location))
      : undefined
  const presentation = resolveSkillPresentation({
    name: input.skill.name,
    description: input.skill.description,
    manifest,
  })
  const catalogIcon = input.source.libraryID
    ? input.catalogIcons.get(input.source.libraryID)
    : undefined
  const icon = catalogIcon ?? presentation.icon

  return {
    displayName: presentation.displayName,
    shortDescription: presentation.shortDescription,
    ...(icon ? { icon } : {}),
  }
}

async function toInstalledSkillInfo(input: {
  skill: OpenCodeSkill
  ruleset: ReturnType<typeof skillRuleset>
  catalogIcons: ReadonlyMap<string, string>
}): Promise<InstalledSkillInfo> {
  const scope = resolveSkillScope(input.skill.location)
  const permissionRule = resolveSkillPermission(input.skill.name, input.ruleset)
  const source = managedSource(input.skill.location)
  const skillDirectory = path.dirname(input.skill.location)
  const [metadata, presentation] = await Promise.all([
    readSkillMetadata(input.skill.location),
    resolveSkillDisplay({
      skill: input.skill,
      source,
      catalogIcons: input.catalogIcons,
    }),
  ])

  return {
    name: input.skill.name,
    description: input.skill.description,
    displayName: presentation.displayName,
    shortDescription: presentation.shortDescription,
    ...(presentation.icon ? { icon: presentation.icon } : {}),
    location: input.skill.location,
    directory: skillDirectory,
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

function sortSkillsByName(skills: OpenCodeSkill[]) {
  return skills.slice().toSorted((left, right) => left.name.localeCompare(right.name))
}

async function readInstalledSkillEntries(input: {
  directory: string
  catalogIcons: ReadonlyMap<string, string>
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
    sortSkillsByName(skills).map((skill) =>
      toInstalledSkillInfo({
        skill,
        ruleset,
        catalogIcons: input.catalogIcons,
      }),
    ),
  )
}

async function readCuratedLibraryEntries(catalog: SkillCatalogDocument) {
  const entries = await listCatalogLibraryItems(catalog)
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
  const catalogSnapshot = options?.refresh
    ? (await refreshSkillArtifacts()).catalog
    : await readSkillCatalogSnapshot()
  await reconcileWithdrawnLibrarySkills(catalogSnapshot.document)

  const [installed, library, globalConfig] = await Promise.all([
    readInstalledSkillEntries({
      directory,
      catalogIcons: catalogIconRoutePathsByID(catalogSnapshot.document),
      refresh: options?.refresh,
    }),
    readCuratedLibraryEntries(catalogSnapshot.document),
    Config.getGlobal(),
  ])

  return {
    directory,
    managedRoot: managedSkillsRoot(),
    externalVendorRootsEnabled: globalConfig.skills_external_vendor_roots_enabled === true,
    installed,
    library: library.entries,
    ...(catalogSnapshot.syncError ? { librarySyncError: catalogSnapshot.syncError } : {}),
  }
}

/**
 * Name, label and artwork for every visible skill — nothing else.
 *
 * The full catalog carries each skill's whole document plus its permission and
 * source story, which is the right payload for the drawer and far too much for a
 * surface that only needs to draw a skill: the slash menu and the composer pill.
 */
export async function listSkillPresentations(
  directory: string,
): Promise<SkillPresentationInfo[]> {
  const [skills, catalogSnapshot] = await Promise.all([
    loadVisibleSkills(directory),
    readSkillCatalogSnapshot(),
  ])
  const catalogIcons = catalogIconRoutePathsByID(catalogSnapshot.document)

  return Promise.all(
    sortSkillsByName(skills).map(async (skill): Promise<SkillPresentationInfo> => {
      const presentation = await resolveSkillDisplay({
        skill,
        source: managedSource(skill.location),
        catalogIcons,
      })
      const info: SkillPresentationInfo = {
        name: skill.name,
        displayName: presentation.displayName,
        shortDescription: presentation.shortDescription,
      }
      if (presentation.icon) info.icon = presentation.icon
      return info
    }),
  )
}
