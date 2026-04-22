import { useEffect } from "react"
import { useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useChatStore } from "@/state/chat-store"

type UseInvalidateQueryOnChatIdleInput = {
  directory: string
  queryKey: QueryKey
}

export function useInvalidateQueryOnChatIdle(input: UseInvalidateQueryOnChatIdleInput) {
  const queryClient = useQueryClient()

  useEffect(() => {
    let previousBusy = useChatStore.getState().directories[input.directory]?.isBusy ?? false

    const unsubscribe = useChatStore.subscribe((state) => {
      const nextBusy = state.directories[input.directory]?.isBusy ?? false

      if (previousBusy && !nextBusy) {
        void queryClient.invalidateQueries({
          queryKey: input.queryKey,
        })
      }

      previousBusy = nextBusy
    })

    return () => {
      unsubscribe()
    }
  }, [input.directory, input.queryKey, queryClient])
}
