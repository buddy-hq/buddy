import { Config } from "../config.js"
import { configErrorMessage, isConfigValidationError } from "../contract/errors.js"
import {
  applyBuddyPersonaHiddenFlags,
  mergeBuddyAndConfiguredAgents,
  resolveConfiguredAgentKey,
} from "./agents.js"
import { parseConfiguredModel } from "./models.js"

export {
  applyBuddyPersonaHiddenFlags,
  configErrorMessage,
  isConfigValidationError,
  mergeBuddyAndConfiguredAgents,
  parseConfiguredModel,
  resolveConfiguredAgentKey,
}

export async function readProjectConfig(directory: string): Promise<Config.Info> {
  return Config.getProject(directory)
}

export async function readProjectConfigFile(directory: string): Promise<Config.Info> {
  return Config.getProjectFile(directory)
}

export async function readGlobalConfig(): Promise<Config.Info> {
  return Config.getGlobal()
}
