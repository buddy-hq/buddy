import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { mcpDirectoryQueryKeys, mcpStatusQueryOptions } from "@/state/mcp-directory-query"
import {
  type ComposerConfig,
  composerConfigQueryOptions,
  DEFAULT_COMPOSER_CONFIG,
  directoryChatQueryKeys,
} from "./chat-config-query"

type UseChatConfigProps = {
  decodedDirectory: string
  hasRegisteredProject: boolean
}

export function useChatConfig(props: UseChatConfigProps) {
  const queryClient = useQueryClient()
  const { decodedDirectory, hasRegisteredProject } = props
  const queryEnabled = decodedDirectory.length > 0 && hasRegisteredProject
  const composerConfigQuery = useQuery({
    ...composerConfigQueryOptions(decodedDirectory),
    enabled: queryEnabled,
  })
  useQuery({
    ...mcpStatusQueryOptions(decodedDirectory),
    enabled: queryEnabled,
  })
  const cachedComposerConfig = queryClient.getQueryData<ComposerConfig>(
    composerConfigQueryOptions(decodedDirectory).queryKey,
  )

  const composerConfig = composerConfigQuery.data ?? cachedComposerConfig ?? DEFAULT_COMPOSER_CONFIG

  const refreshSlashCommands = useCallback(() => {
    if (!queryEnabled) return

    void queryClient.invalidateQueries({
      queryKey: directoryChatQueryKeys.composerConfig(decodedDirectory),
    })
  }, [decodedDirectory, queryClient, queryEnabled])

  const refreshMcpStatus = useCallback(() => {
    if (!queryEnabled) return

    void queryClient.invalidateQueries({
      queryKey: mcpDirectoryQueryKeys.status(decodedDirectory),
    })
  }, [decodedDirectory, queryClient, queryEnabled])

  return {
    ...composerConfig,
    refreshSlashCommands,
    refreshMcpStatus,
  }
}
