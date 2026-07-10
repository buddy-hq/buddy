import { getGlobalConfig, loadProjectConfig, loadProjectConfigFile } from "./store/read-config.js"
import {
  mutateGlobalConfig,
  replaceGlobalConfig,
  setProjectMcpConfig,
  updateGlobalConfig,
  updateProjectConfig,
} from "./store/write-config.js"
import {
  Agent as AgentSchema,
  Info as InfoSchema,
  Mcp as McpSchema,
  Permission as PermissionSchema,
} from "./store/types.js"
import type {
  Agent as AgentType,
  Info as InfoType,
  Mcp as McpType,
  Permission as PermissionType,
  PermissionAction as PermissionActionType,
  PermissionRule as PermissionRuleType,
} from "./store/types.js"

export { InvalidError, JsonError } from "./contract/errors.js"

export namespace Config {
  export const Mcp = McpSchema
  export type Mcp = McpType

  export type PermissionAction = PermissionActionType

  export type PermissionRule = PermissionRuleType

  export const Permission = PermissionSchema
  export type Permission = PermissionType

  export const Agent = AgentSchema
  export type Agent = AgentType

  export const Info = InfoSchema
  export type Info = InfoType

  export async function getProject(directory: string) {
    return loadProjectConfig(directory)
  }

  export async function getProjectFile(directory: string) {
    return loadProjectConfigFile(directory)
  }

  export async function getGlobal() {
    return getGlobalConfig()
  }

  export async function updateProject(directory: string, config: Info) {
    return updateProjectConfig(directory, config)
  }

  export async function setProjectMcp(directory: string, name: string, mcp: Mcp) {
    return setProjectMcpConfig(directory, name, mcp)
  }

  export async function updateGlobal(config: Info) {
    return updateGlobalConfig(config)
  }

  export async function replaceGlobal(config: Info) {
    return replaceGlobalConfig(config)
  }

  export async function mutateGlobal(mutation: (current: Info) => Info) {
    return mutateGlobalConfig(mutation)
  }
}
