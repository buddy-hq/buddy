import { mergeDeep } from "remeda"
import { Flag } from "../../flag"
import { loadConfigFile, loadConfigText } from "../contract/document.js"
import { getCachedGlobalConfig } from "./global-cache.js"
import { resolveProjectConfigContext, resolveProjectConfigFile } from "./config-paths.js"
import { applyEnvironmentPermission, applyToolPermissionDefaults } from "./permission-overrides.js"
import type { Info } from "./types.js"

function mergeInfo(target: Info, source: Info): Info {
  return mergeDeep(target, source)
}

export async function getGlobalConfig(): Promise<Info> {
  return getCachedGlobalConfig()
}

export async function loadProjectConfig(directory: string): Promise<Info> {
  const context = await resolveProjectConfigContext(directory)
  let result: Info = {}

  result = mergeInfo(result, await getCachedGlobalConfig())

  if (Flag.BUDDY_CONFIG) {
    result = mergeInfo(result, await loadConfigFile(Flag.BUDDY_CONFIG))
  }

  if (!Flag.BUDDY_DISABLE_PROJECT_CONFIG) {
    result = mergeInfo(
      result,
      await loadConfigFile(resolveProjectConfigFile(context.configDirectory)),
    )
  }

  result.agent = result.agent || {}
  result.personas = result.personas || {}

  if (Flag.BUDDY_CONFIG_CONTENT) {
    result = mergeInfo(
      result,
      await loadConfigText(Flag.BUDDY_CONFIG_CONTENT, {
        dir: context.directory,
        source: "BUDDY_CONFIG_CONTENT",
      }),
    )
  }

  if (Flag.BUDDY_PERMISSION) {
    applyEnvironmentPermission(result, Flag.BUDDY_PERMISSION)
  }

  applyToolPermissionDefaults(result)

  return result
}
