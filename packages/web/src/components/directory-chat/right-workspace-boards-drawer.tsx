import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from "@buddy/ui"
import { PlusIcon, PresentationIcon } from "@/icons/app-icons"
import { stringifyError } from "@/lib/api-client"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { relativeTime } from "@/components/layout/sidebar-helpers"
import {
  refetchActiveWorkspaceObjectQueries,
  workspaceObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import type { RightWorkspaceOpenOutcome, RightWorkspaceOpenRequest } from "./right-workspace-open"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListRow,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
} from "./right-workspace-drawer-ui"

type RightWorkspaceBoardsDrawerProps = {
  directory: string
  onClose: () => void
  onOpen: (request: RightWorkspaceOpenRequest) => Promise<RightWorkspaceOpenOutcome>
}

function formatBoardTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return `Edited ${relativeTime(parsed.getTime())}`
}

async function createEmptyBoardAndOpen(input: {
  directory: string
  create: () => Promise<{ objectID: string }>
  refetch: () => Promise<unknown>
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

export function RightWorkspaceBoardsDrawer(props: RightWorkspaceBoardsDrawerProps) {
  const queryClient = useQueryClient()
  const createBoardInFlightRef = useRef(false)
  const boardsQuery = useQuery(workspaceObjectsQueryOptions(props.directory, "whiteboard"))
  const boards = boardsQuery.data?.objects ?? []
  const createBoardMutation = useMutation({
    mutationFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).objectWhiteboard.object.create({
          directory: props.directory,
        }),
      ),
  })

  function openBoard(objectID: string) {
    void props.onOpen({
      type: "object",
      directory: props.directory,
      target: createBenchObjectTarget("whiteboard", objectID),
    })
  }

  async function createBoard() {
    if (createBoardInFlightRef.current) return
    createBoardInFlightRef.current = true
    try {
      await createEmptyBoardAndOpen({
        directory: props.directory,
        create: () => createBoardMutation.mutateAsync(),
        refetch: () => refetchActiveWorkspaceObjectQueries(queryClient, props.directory),
        open: props.onOpen,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      createBoardInFlightRef.current = false
    }
  }

  return (
    <RightWorkspaceDrawerShell
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "boards" })}
      title="Boards"
      action={{
        label: "Create board",
        icon: PlusIcon,
        busy: createBoardMutation.isPending,
        onClick: () => {
          void createBoard()
        },
      }}
      onClose={props.onClose}
    >
      {boardsQuery.isPending ? <RightWorkspaceListSkeleton count={3} /> : null}
      {boardsQuery.error ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PresentationIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Boards unavailable</EmptyTitle>
            <EmptyDescription>{stringifyError(boardsQuery.error)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {!boardsQuery.isPending && !boardsQuery.error && boards.length === 0 ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PresentationIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No boards yet</EmptyTitle>
            <EmptyDescription>
              Create a shared board that can be opened and edited from any chat in this notebook.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              disabled={createBoardMutation.isPending}
              onClick={() => {
                void createBoard()
              }}
            >
              <PlusIcon data-icon="inline-start" aria-hidden />
              Create board
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}
      {boards.length > 0 ? (
        <div className="flex flex-col gap-1">
          <RightWorkspaceSectionLabel>Whiteboards</RightWorkspaceSectionLabel>
          {boards.map((board) => (
            <RightWorkspaceListRow
              key={board.objectID}
              icon={PresentationIcon}
              title={board.title}
              metadata={formatBoardTimestamp(board.updatedAt)}
              onClick={() => openBoard(board.objectID)}
            />
          ))}
        </div>
      ) : null}
    </RightWorkspaceDrawerShell>
  )
}

export { createEmptyBoardAndOpen }
