import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { authenticateMcpServer, connectMcpServer, disconnectMcpServer } from "@/state/chat-actions"
import type { McpStatusMap } from "@/state/chat-types"
import {
  invalidateMcpDirectoryQueries,
  mcpDirectoryQueryKeys,
  mcpStatusQueryOptions,
  projectConfigQueryOptions,
} from "@/state/mcp-directory-query"
import { formatMcpError, parseMcpConfigMap, type McpConfig } from "./mcp-config-schema"

const MCP_SEARCH_VISIBLE_THRESHOLD = 3
const EMPTY_STATUS_MAP: McpStatusMap = {}
const EMPTY_PROJECT_CONFIG: Record<string, unknown> = {}

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
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [localError, setLocalError] = useState<string | undefined>(undefined)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const queryEnabled = open
  const mcpStatusQuery = useQuery({
    ...mcpStatusQueryOptions(directory),
    enabled: queryEnabled,
  })
  const projectConfigQuery = useQuery({
    ...projectConfigQueryOptions(directory),
    enabled: queryEnabled,
  })

  const statusByName = mcpStatusQuery.data ?? EMPTY_STATUS_MAP
  const configByName = useMemo(
    () => parseMcpConfigMap(projectConfigQuery.data ?? EMPTY_PROJECT_CONFIG),
    [projectConfigQuery.data],
  )
  const queryError = useMemo(() => {
    if (mcpStatusQuery.error) {
      return formatMcpError(mcpStatusQuery.error)
    }

    if (projectConfigQuery.error) {
      return formatMcpError(projectConfigQuery.error)
    }

    return undefined
  }, [mcpStatusQuery.error, projectConfigQuery.error])
  const error = localError ?? queryError
  const loading = queryEnabled && (mcpStatusQuery.isPending || projectConfigQuery.isPending)

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
    queryClient.setQueryData(mcpDirectoryQueryKeys.status(directory), status)
    if (status[name]?.status === "needs_auth") {
      const authenticatedStatus = await authenticateMcpServer(directory, name)
      queryClient.setQueryData(mcpDirectoryQueryKeys.status(directory), authenticatedStatus)
      await invalidateMcpDirectoryQueries(queryClient, directory)
      return authenticatedStatus
    }

    await invalidateMcpDirectoryQueries(queryClient, directory)
    return status
  }

  async function disconnectMcp(name: string) {
    const status = await disconnectMcpServer(directory, name)
    queryClient.setQueryData(mcpDirectoryQueryKeys.status(directory), status)
    await invalidateMcpDirectoryQueries(queryClient, directory)
  }

  const setConfigByName = useCallback(
    (next: Record<string, McpConfig>) => {
      queryClient.setQueryData(
        mcpDirectoryQueryKeys.projectConfig(directory),
        (current: Record<string, unknown> | undefined) =>
          current ? { ...current, mcp: next } : { mcp: next },
      )
    },
    [directory, queryClient],
  )

  useEffect(() => {
    if (!open) return
    setQuery("")
  }, [open])

  async function toggleMcp(name: string) {
    if (pendingName) return

    const current = statusByName[name]
    setPendingName(name)
    setLocalError(undefined)
    try {
      if (current?.status === "connected") {
        await disconnectMcp(name)
      } else {
        await enableMcp(name)
      }
    } catch (toggleError) {
      setLocalError(formatMcpError(toggleError))
    } finally {
      setPendingName(null)
    }
  }

  async function connectMcp(name: string) {
    if (pendingName) return
    setPendingName(name)
    setLocalError(undefined)
    try {
      const status = await authenticateMcpServer(directory, name)
      queryClient.setQueryData(mcpDirectoryQueryKeys.status(directory), status)
      await invalidateMcpDirectoryQueries(queryClient, directory)
    } catch (authError) {
      setLocalError(formatMcpError(authError))
    } finally {
      setPendingName(null)
    }
  }

  return {
    query,
    setQuery,
    loading,
    error,
    setError: setLocalError,
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
