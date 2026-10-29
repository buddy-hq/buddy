import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { refetchActiveWorkspaceObjectQueries } from "@/state/workspace-objects-query"

export function useRefetchObjectsOnWorkerFinish(directory: string | undefined, workerFinished: boolean) {
  const queryClient = useQueryClient()
  const previouslyFinished = useRef(workerFinished)
  useEffect(() => {
    const finishedNow = workerFinished && !previouslyFinished.current
    previouslyFinished.current = workerFinished
    if (directory && finishedNow) void refetchActiveWorkspaceObjectQueries(queryClient, directory)
  }, [directory, queryClient, workerFinished])
}
