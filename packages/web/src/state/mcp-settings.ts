import type { McpConfig } from "@/components/mcp-dialog/mcp-config-schema"
import { readRecord } from "./project-config-readers"
import { parseBooleanValue, parseBuddyConfigObject, parseStringValue } from "./parse-external"
import type { TBuddyConfigObject } from "./parse-external"

type TMcpConfigMap = Record<string, McpConfig>
type TNotebookMcpOverridePatch = {
  mcp: Record<string, { enabled: boolean | null } | null>
}

function readNotebookMcpEntry<TConfig>(input: TConfig, name: string) {
  const mcpConfig = readRecord(input, "mcp")
  return parseBuddyConfigObject(mcpConfig?.[name])
}

function isNotebookMcpDefinition(entry: TBuddyConfigObject | undefined) {
  const type = parseStringValue(entry?.type)
  return type === "local" || type === "remote"
}

export function notebookDefinesMcp<TConfig>(rawProjectConfig: TConfig, name: string): boolean {
  return isNotebookMcpDefinition(readNotebookMcpEntry(rawProjectConfig, name))
}

export function mcpEnabledByDefault(config: McpConfig | undefined) {
  return config?.enabled !== false
}

export function readNotebookMcpEnabledOverride<TConfig>(rawProjectConfig: TConfig, name: string) {
  const entry = readNotebookMcpEntry(rawProjectConfig, name)
  if (!entry) {
    return undefined
  }

  return parseBooleanValue(entry.enabled)
}

export function resolveNotebookMcpEnabled<TConfig>(
  globalConfigByName: TMcpConfigMap,
  rawProjectConfig: TConfig,
  name: string,
) {
  const override = readNotebookMcpEnabledOverride(rawProjectConfig, name)
  if (override !== undefined) {
    return override
  }

  return mcpEnabledByDefault(globalConfigByName[name])
}

export function buildNotebookMcpOverridePatch<TConfig>(input: {
  globalConfigByName: TMcpConfigMap
  rawProjectConfig: TConfig
  name: string
  enabled: boolean
}): TNotebookMcpOverridePatch | undefined {
  const currentOverride = readNotebookMcpEnabledOverride(input.rawProjectConfig, input.name)
  const hasNotebookDefinition = notebookDefinesMcp(input.rawProjectConfig, input.name)
  const defaultEnabled = mcpEnabledByDefault(input.globalConfigByName[input.name])
  const nextOverride = input.enabled === defaultEnabled ? undefined : input.enabled

  if (currentOverride === nextOverride) {
    return undefined
  }

  if (hasNotebookDefinition) {
    return {
      mcp: {
        [input.name]: {
          enabled: nextOverride === undefined ? null : nextOverride,
        },
      },
    }
  }

  return {
    mcp: {
      [input.name]: nextOverride === undefined ? null : { enabled: nextOverride },
    },
  }
}
