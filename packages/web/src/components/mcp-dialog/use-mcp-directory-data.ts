import { useCallback, useEffect, useMemo, useState } from "react"
import {
  authenticateMcpServer,
  connectMcpServer,
  disconnectMcpServer,
  loadMcpStatus,
  loadProjectConfig,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { McpStatusMap } from "@/state/chat-types"
import { formatMcpError, parseMcpConfigMap, type McpConfig } from "./mcp-config-schema"

const MCP_SEARCH_VISIBLE_THRESHOLD = 3

type UseMcpDirectoryDataProps = {
  directory: string
  open: boolean
}

export type McpDirectoryDataState = {
  query: string
  setQuery: (value: string) => void
  loading: boolean
  error?: string
  setError: (value: string | undefined) => void
  allNames: string[]
  entries: string[]
  showSearch: boolean
  enabledCount: number
  totalCount: number
  pendingName: string | null
  configByName: Record<string, McpConfig>
  setConfigByName: (next: Record<string, McpConfig>) => void
  statusByName: McpStatusMap
  enableMcp: (name: string) => Promise<McpStatusMap | undefined>
  disconnectMcp: (name: string) => Promise<void>
  toggleMcp: (name: string) => Promise<void>
  connectMcp: (name: string) => Promise<void>
}

export function useMcpDirectoryData(props: UseMcpDirectoryDataProps): McpDirectoryDataState {
  const { directory, open } = props
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [configByName, setConfigByName] = useState<Record<string, McpConfig>>({})
  const statusByName = useChatStore((state) => state.directories[directory]?.mcpStatus ?? {})

  const allNames = useMemo(
    () =>
      Array.from(new Set([...Object.keys(statusByName), ...Object.keys(configByName)])).sort(
        (left, right) => left.localeCompare(right),
      ),
    [configByName, statusByName],
  )

  const entries = useMemo(() => {
    const search = query.trim().toLowerCase()
    return allNames.filter((name) => {
      if (!search) return true
      return name.toLowerCase().includes(search)
    })
  }, [allNames, query])

  const enabledCount = useMemo(
    () => Object.values(statusByName).filter((entry) => entry.status === "connected").length,
    [statusByName],
  )

  async function enableMcp(name: string) {
    const status = await connectMcpServer(directory, name)
    if (status[name]?.status === "needs_auth") {
      return authenticateMcpServer(directory, name)
    }
    return status
  }

  async function disconnectMcp(name: string) {
    await disconnectMcpServer(directory, name)
  }

  const refreshData = useCallback(async () => {
    if (!directory) return

    setLoading(true)
    setError(undefined)

    const [statusResult, configResult] = await Promise.allSettled([
      loadMcpStatus(directory),
      loadProjectConfig(directory),
    ])

    if (configResult.status === "fulfilled") {
      setConfigByName(parseMcpConfigMap(configResult.value))
    }

    const statusError =
      statusResult.status === "rejected" ? formatMcpError(statusResult.reason) : undefined
    const configError =
      configResult.status === "rejected" ? formatMcpError(configResult.reason) : undefined
    setError(statusError ?? configError)

    setLoading(false)
  }, [directory])

  useEffect(() => {
    if (!open) return
    setQuery("")
    void refreshData()
  }, [open, refreshData])

  async function toggleMcp(name: string) {
    if (!directory || pendingName) return

    const current = statusByName[name]
    setPendingName(name)
    setError(undefined)
    try {
      if (current?.status === "connected") {
        await disconnectMcp(name)
      } else {
        await enableMcp(name)
      }
    } catch (toggleError) {
      setError(formatMcpError(toggleError))
    } finally {
      setPendingName(null)
    }
  }

  async function connectMcp(name: string) {
    if (!directory || pendingName) return
    setPendingName(name)
    setError(undefined)
    try {
      await authenticateMcpServer(directory, name)
    } catch (authError) {
      setError(formatMcpError(authError))
    } finally {
      setPendingName(null)
    }
  }

  return {
    query,
    setQuery,
    loading,
    error,
    setError,
    allNames,
    entries,
    showSearch: allNames.length >= MCP_SEARCH_VISIBLE_THRESHOLD,
    enabledCount,
    totalCount: allNames.length,
    pendingName,
    configByName,
    setConfigByName,
    statusByName,
    enableMcp,
    disconnectMcp,
    toggleMcp,
    connectMcp,
  }
}
