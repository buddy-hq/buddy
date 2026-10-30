import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  PromptAccessMode,
  PromptAccessModeOption,
} from "@/components/prompt/components/prompt-access-mode-select"
import { language } from "@/context/language"
import { directoryActionError } from "@/state/chat-actions"
import { useChatAccessModeStore } from "@/state/chat-access-mode-store"
import { useChatStore } from "@/state/chat-store"
import { chatAccessQueryKeys, chatAccessQueryOptions, setChatAccessMode } from "./chat-access-query"

type ChatAccessModeChange = {
  directory: string
  sessionID: string
  mode: PromptAccessMode
}

type ChatAccessModeState = {
  mode: PromptAccessMode
  options: readonly PromptAccessModeOption[]
  onModeChange: (mode: PromptAccessMode) => void
  isChild: boolean
  showSelector: boolean
  isPending: boolean
  error: Error | null
}

export function useChatAccessMode(input: {
  directory: string
  sessionID?: string
  parentID?: string
}): ChatAccessModeState {
  const { directory, sessionID, parentID } = input
  const queryClient = useQueryClient()
  const lastMode = useChatAccessModeStore(
    (state) => state.lastModeByDirectory[directory] ?? "default",
  )
  const setLastMode = useChatAccessModeStore((state) => state.setLastMode)
  const storedParentID = useChatStore(
    (state) =>
      state.directories[directory]?.sessions.find((session) => session.id === sessionID)?.parentID,
  )
  const isChild = Boolean(parentID || storedParentID)
  const query = useQuery(chatAccessQueryOptions(directory, sessionID))
  const mutationKey = chatAccessQueryKeys.session(directory, sessionID)
  const pendingChanges = useIsMutating({ mutationKey, exact: true })
  const mutation = useMutation({
    mutationKey,
    scope: { id: JSON.stringify(mutationKey) },
    mutationFn: (change: ChatAccessModeChange) =>
      setChatAccessMode(change.directory, change.sessionID, change.mode),
    onMutate: (change) =>
      queryClient.cancelQueries({ queryKey: chatAccessQueryKeys.directory(change.directory) }),
    onSuccess: (data, change) => {
      setLastMode(change.directory, data.mode)
    },
    onError: (error, change) => {
      useChatStore.getState().setDirectoryError(change.directory, directoryActionError(error))
    },
    onSettled: async (_data, _error, change) => {
      const queryKey = chatAccessQueryKeys.directory(change.directory)
      await queryClient.cancelQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey, refetchType: "all" })
    },
  })
  const options: readonly PromptAccessModeOption[] = [
    {
      mode: "supervised",
      label: language.t("prompt.accessMode.supervised.label"),
      description: language.t("prompt.accessMode.supervised.description"),
    },
    {
      mode: "default",
      label: language.t("prompt.accessMode.default.label"),
      description: language.t("prompt.accessMode.default.description"),
    },
    {
      mode: "full",
      label: language.t("prompt.accessMode.full.label"),
      description: language.t("prompt.accessMode.full.description"),
    },
  ]

  return {
    mode: sessionID ? (query.data?.mode ?? "default") : lastMode,
    options,
    onModeChange(mode) {
      if (isChild || !directory) return
      if (!sessionID) {
        setLastMode(directory, mode)
        return
      }
      mutation.mutate({ directory, sessionID, mode })
    },
    isChild,
    showSelector: !isChild,
    isPending:
      pendingChanges > 0 ||
      (Boolean(sessionID) &&
        (query.isPending || query.isFetching || query.isPaused || query.isError)),
    error: mutation.error ?? query.error,
  }
}
