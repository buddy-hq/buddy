import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef } from "react"
import { toast } from "@buddy/ui"
import type {
  RightWorkspaceOpenOutcome,
  RightWorkspaceOpenRequest,
  RightWorkspaceOpener,
} from "@/components/directory-chat/right-workspace-open"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { refetchActiveWorkspaceObjectQueries } from "@/state/workspace-objects-query"

export type CreateBoardController = {
  /** True while a board is being created, so triggers can show their busy state. */
  pending: boolean
  createBoard: () => Promise<RightWorkspaceOpenOutcome>
}

/**
 * Create an empty board, refresh the catalogs that list it, then open it. The
 * order matters: the drawer and every other list must already know about the
 * board by the time the Bench shows it.
 */
async function createEmptyBoardAndOpen(input: {
  directory: string
  create: () => Promise<{ objectID: string }>
  refetch: () => Promise<void>
  open: (request: RightWorkspaceOpenRequest) => Promise<RightWorkspaceOpenOutcome>
}): Promise<RightWorkspaceOpenOutcome> {
  const board = await input.create()
  await input.refetch()
  return input.open({
    type: "object",
    directory: input.directory,
    target: createBenchObjectTarget("whiteboard", board.objectID),
  })
}

/**
 * The one way a new board comes into being: the Boards drawer's plus, the
 * sidebar's New board row, and anything else all take this path, so a board
 * always lands on the Bench of the chat the learner is looking at.
 */
export function useCreateBoard(input: {
  directory: string
  open: RightWorkspaceOpener
}): CreateBoardController {
  const queryClient = useQueryClient()
  /** Guards the gap between click and mutation start, where `isPending` is still false. */
  const inFlightRef = useRef(false)
  const createBoardMutation = useMutation({
    mutationFn: async () =>
      requireBuddyData(
        await getBuddyClient(input.directory).objectWhiteboard.object.create({
          directory: input.directory,
        }),
      ),
  })
  const { directory, open } = input
  const { mutateAsync } = createBoardMutation

  const createBoard = useCallback(async (): Promise<RightWorkspaceOpenOutcome> => {
    if (inFlightRef.current) return "blocked"
    inFlightRef.current = true
    try {
      return await createEmptyBoardAndOpen({
        directory,
        create: () => mutateAsync(),
        refetch: async () => {
          await refetchActiveWorkspaceObjectQueries(queryClient, directory)
        },
        open,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return "failed"
    } finally {
      inFlightRef.current = false
    }
  }, [directory, mutateAsync, open, queryClient])

  return { pending: createBoardMutation.isPending, createBoard }
}

export { createEmptyBoardAndOpen }
