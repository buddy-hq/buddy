import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { directoryChatQueryKeys } from "@/lib/directory-chat/chat-config-query"
import { patchGlobalConfig } from "./chat-actions"
import {
  globalConfigQueryOptions,
  setGlobalConfigQueryData,
} from "./global-config-query"
import { stringifyCaughtError } from "./parse-external"
import {
  CONCISE_RESPONSES_CONFIG_KEY,
  readConciseResponses,
} from "./project-config-readers"

export function useConciseResponseSettings() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery(globalConfigQueryOptions())
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      patchGlobalConfig({
        [CONCISE_RESPONSES_CONFIG_KEY]: enabled,
      }),
    onSuccess: async (updatedGlobal) => {
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      await queryClient.invalidateQueries({
        queryKey: directoryChatQueryKeys.allComposerConfigs(),
      })
    },
  })

  const queryError = settingsQuery.error
  const error = mutation.error ?? queryError

  return {
    enabled: readConciseResponses(settingsQuery.data ?? {}),
    loading: settingsQuery.isPending,
    saving: mutation.isPending,
    error: error ? stringifyCaughtError(error) : undefined,
    setEnabled: (enabled: boolean) => mutation.mutate(enabled),
  }
}
