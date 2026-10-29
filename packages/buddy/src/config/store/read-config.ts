import { mergeDeep } from "remeda"
import { Flag } from "../../flag"
import {
  loadConfigFile,
  loadConfigText,
  loadProjectConfigFile as loadProjectConfigDocument,
} from "../contract/document.js"
import { getCachedGlobalConfig } from "./global-cache.js"
import {
  resolveGlobalConfigFile,
  resolveProjectConfigContext,
  resolveProjectConfigFile,
} from "./config-paths.js"
import {
  applyEnvironmentPermission,
  applySkillPermissionDefaults,
  applyToolPermissionDefaults,
} from "./permission-overrides.js"
import type { Info, ProjectInfo } from "./types.js"

function mergeInfo(target: Info, source: Info | ProjectInfo): Info {
  return mergeDeep(target, source)
}

export async function getGlobalConfig(): Promise<Info> {
  return getCachedGlobalConfig()
}

export async function loadProjectConfigFile(
  directory: string,
  options?: { resolveSubstitutions?: boolean },
): Promise<ProjectInfo> {
  const context = await resolveProjectConfigContext(directory)

  if (Flag.BUDDY_DISABLE_PROJECT_CONFIG) {
    return {}
  }

  return loadProjectConfigDocument(resolveProjectConfigFile(context.configDirectory), options)
}

export async function loadProjectConfig(
  directory: string,
  options?: { resolveSubstitutions?: boolean },
): Promise<Info> {
  const context = await resolveProjectConfigContext(directory)
  let result: Info = {}

  result = mergeInfo(
    result,
    options?.resolveSubstitutions === false
      ? await loadConfigFile(resolveGlobalConfigFile(), options)
      : await getCachedGlobalConfig(),
  )

  if (Flag.BUDDY_CONFIG) {
    result = mergeInfo(result, await loadConfigFile(Flag.BUDDY_CONFIG, options))
  }

  if (!Flag.BUDDY_DISABLE_PROJECT_CONFIG) {
    result = mergeInfo(
      result,
      await loadProjectConfigDocument(resolveProjectConfigFile(context.configDirectory), options),
    )
  }

  result.agent = result.agent || {}
  result.personas = result.personas || {}

  if (Flag.BUDDY_CONFIG_CONTENT) {
    result = mergeInfo(
      result,
      await loadConfigText(
        Flag.BUDDY_CONFIG_CONTENT,
        {
          dir: context.directory,
          source: "BUDDY_CONFIG_CONTENT",
        },
        options,
      ),
    )
  }

  if (Flag.BUDDY_PERMISSION) {
    applyEnvironmentPermission(result, Flag.BUDDY_PERMISSION)
  }

  applyToolPermissionDefaults(result)
  applySkillPermissionDefaults(result)

  return result
}
