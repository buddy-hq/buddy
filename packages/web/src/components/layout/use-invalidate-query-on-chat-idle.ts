import { useEffect, useRef } from "react"
import { useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useChatStore } from "@/state/chat-store"

type UseInvalidateQueryOnChatIdleInput = {
  directory: string
  queryKey: QueryKey
}

export function useInvalidateQueryOnChatIdle(input: UseInvalidateQueryOnChatIdleInput) {
  const queryClient = useQueryClient()
  const isBusy = useChatStore((state) => state.directories[input.directory]?.isBusy ?? false)
  const previousStateRef = useRef({
    directory: input.directory,
    isBusy,
  })

  useEffect(() => {
    if (previousStateRef.current.directory !== input.directory) {
      previousStateRef.current = {
        directory: input.directory,
        isBusy,
      }
      return
    }

    if (previousStateRef.current.isBusy && !isBusy) {
      void queryClient.invalidateQueries({
        queryKey: input.queryKey,
      })
    }
    previousStateRef.current.isBusy = isBusy
  }, [input.directory, input.queryKey, isBusy, queryClient])
}
