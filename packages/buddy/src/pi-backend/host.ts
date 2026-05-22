import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent"
import type { ExtensionFactory, Skill } from "@earendil-works/pi-coding-agent"
import { readProjectConfig } from "../config/runtime/config-access"
import { resolveBuddySkillPaths } from "../config/skills/paths"
import { REGISTERED_BUDDY_PERSONAS } from "../learning/personas/registry"
import { getDefaultBuddyPersona } from "../learning/personas/wiring/persona-profiles"
import { piPackageResourcePaths } from "./package-resources"
import { piAgentDirectory } from "./paths"
export { getPiAuthStorage, getPiModelRegistry, refreshPiModels } from "./model-services"

const BUDDY_SYSTEM_PROMPT_FALLBACK = "You are Buddy, a local-first coding and learning agent."
const SUPPRESSED_BUILT_IN_SKILLS = new Set(["customize-opencode"])

export type BuddyPiRuntimeResources = {
  skillPaths: string[]
  systemPrompt: string
}

export type CreateBuddyPiResourceLoaderResult = {
  settingsManager: SettingsManager
  resourceLoader: DefaultResourceLoader
  resources: BuddyPiRuntimeResources
}

type ResolveBuddyPiRuntimeResourcesOptions = {
  systemPrompt?: string
}

type CreateBuddyPiResourceLoaderOptions = {
  directory: string
  extensionFactories?: ExtensionFactory[]
  resources?: BuddyPiRuntimeResources
}

function isExternalVendorSkillPath(location: string) {
  const segments = location.split(/[\\/]/)
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index]
    const next = segments[index + 1]
    if ((current === ".claude" || current === ".agents") && next === "skills") {
      return true
    }
  }

  return false
}

function filterBuddyVisibleSkills(skills: Skill[], externalVendorRootsEnabled: boolean) {
  return skills.filter((skill) => {
    if (
      SUPPRESSED_BUILT_IN_SKILLS.has(skill.name) &&
      (skill.filePath === "<built-in>" || skill.filePath.includes("opencode"))
    ) {
      return false
    }

    if (!externalVendorRootsEnabled && isExternalVendorSkillPath(skill.filePath)) {
      return false
    }

    return true
  })
}

export function createPiSettingsManager(directory: string) {
  return SettingsManager.create(directory, piAgentDirectory())
}

export async function resolveBuddyPiRuntimeResources(
  directory: string,
  options?: ResolveBuddyPiRuntimeResourcesOptions,
): Promise<BuddyPiRuntimeResources> {
  const config = await readProjectConfig(directory)
  const persona = getDefaultBuddyPersona({
    defaultPersona: config.default_persona,
    overrides: config.personas,
  })
  const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
    (candidate) => candidate.id === persona.id,
  )

  return {
    skillPaths: (await resolveBuddySkillPaths(config, directory)) ?? [],
    systemPrompt:
      options?.systemPrompt?.trim() ||
      personaDefinition?.runtime.prompt.trim() ||
      BUDDY_SYSTEM_PROMPT_FALLBACK,
  }
}

export async function createBuddyPiResourceLoader(
  input: CreateBuddyPiResourceLoaderOptions,
): Promise<CreateBuddyPiResourceLoaderResult> {
  const settingsManager = createPiSettingsManager(input.directory)
  const resources = input.resources ?? (await resolveBuddyPiRuntimeResources(input.directory))
  const projectConfig = await readProjectConfig(input.directory)
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.directory,
    agentDir: piAgentDirectory(),
    settingsManager,
    additionalExtensionPaths: piPackageResourcePaths(),
    ...(resources.skillPaths.length > 0 ? { additionalSkillPaths: resources.skillPaths } : {}),
    systemPrompt: resources.systemPrompt,
    skillsOverride: (base) => ({
      skills: filterBuddyVisibleSkills(
        base.skills,
        projectConfig.skills_external_vendor_roots_enabled === true,
      ),
      diagnostics: base.diagnostics,
    }),
    ...(input.extensionFactories ? { extensionFactories: input.extensionFactories } : {}),
  })

  await resourceLoader.reload()

  return {
    settingsManager,
    resourceLoader,
    resources,
  }
}
