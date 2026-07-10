import type { McpConfig } from "@/components/mcp-dialog/mcp-config-schema"
import { readRecord } from "./project-config-readers"

type McpConfigMap = Record<string, McpConfig>
type NotebookMcpOverridePatch = {
  mcp: Record<string, { enabled: boolean | null } | null>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readNotebookMcpEntry(rawProjectConfig: Record<string, unknown>, name: string) {
  const mcpConfig = readRecord(rawProjectConfig, "mcp")
  const entry = mcpConfig?.[name]

  return isRecord(entry) ? entry : undefined
}

function isNotebookMcpDefinition(entry: Record<string, unknown> | undefined) {
  return entry?.type === "local" || entry?.type === "remote"
}

export function notebookDefinesMcp(
  rawProjectConfig: Record<string, unknown>,
  name: string,
): boolean {
  return isNotebookMcpDefinition(readNotebookMcpEntry(rawProjectConfig, name))
}

export function mcpEnabledByDefault(config: McpConfig | undefined) {
  return config?.enabled !== false
}

export function readNotebookMcpEnabledOverride(
  rawProjectConfig: Record<string, unknown>,
  name: string,
) {
  const entry = readNotebookMcpEntry(rawProjectConfig, name)
  if (!entry) {
    return undefined
  }

  const enabled = entry.enabled
  return typeof enabled === "boolean" ? enabled : undefined
}

export function resolveNotebookMcpEnabled(
  globalConfigByName: McpConfigMap,
  rawProjectConfig: Record<string, unknown>,
  name: string,
) {
  const override = readNotebookMcpEnabledOverride(rawProjectConfig, name)
  if (override !== undefined) {
    return override
  }

  return mcpEnabledByDefault(globalConfigByName[name])
}

export function buildNotebookMcpOverridePatch(input: {
  globalConfigByName: McpConfigMap
  rawProjectConfig: Record<string, unknown>
  name: string
  enabled: boolean
}): NotebookMcpOverridePatch | undefined {
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
