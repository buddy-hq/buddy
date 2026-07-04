import { useQuery } from "@tanstack/react-query"
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@buddy/ui"
import { PlusIcon, PresentationIcon } from "lucide-react"
import { whiteboardSessionPeekQueryOptions } from "@/components/whiteboard/whiteboard-query"
import { stringifyError } from "@/lib/api-client"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { relativeTime } from "@/components/layout/sidebar-helpers"
import type { RightWorkspaceOpenOutcome, RightWorkspaceOpenRequest } from "./right-workspace-open"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListRow,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
} from "./right-workspace-drawer-ui"

const BOARD_QUERY_RETRY_LIMIT = 3

type RightWorkspaceBoardsDrawerProps = {
  directory: string
  sessionID?: string
  onClose: () => void
  onCreateBoard: () => void
  onOpen: (request: RightWorkspaceOpenRequest) => Promise<RightWorkspaceOpenOutcome>
}

function formatBoardTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return `Edited ${relativeTime(parsed.getTime())}`
}

function isMissingBoardPeekError(error: unknown): boolean {
  const message = stringifyError(error).toLocaleLowerCase()
  return message.includes("404") || message.includes("not found")
}

export function RightWorkspaceBoardsDrawer(props: RightWorkspaceBoardsDrawerProps) {
  const hasSession = props.sessionID !== undefined
  const boardQuery = useQuery({
    ...whiteboardSessionPeekQueryOptions(props.directory, props.sessionID ?? ""),
    enabled: hasSession,
    retry: (failureCount, error) =>
      !isMissingBoardPeekError(error) && failureCount < BOARD_QUERY_RETRY_LIMIT,
  })
  const board = boardQuery.data?.currentBoard
  const objectID = boardQuery.data?.objectID
  const boardLoading = hasSession && boardQuery.isPending
  const missingBoardFromPeekError =
    boardQuery.error !== null && isMissingBoardPeekError(boardQuery.error)
  const boardUnavailableError = missingBoardFromPeekError ? null : boardQuery.error

  function openBoard() {
    if (!objectID) return
    void props.onOpen({
      type: "object",
      directory: props.directory,
      target: createBenchObjectTarget("whiteboard", objectID),
    })
  }

  return (
    <RightWorkspaceDrawerShell
      title="Boards"
      action={
        !board
          ? {
              label: "Create board",
              icon: PlusIcon,
              onClick: props.onCreateBoard,
            }
          : undefined
      }
      onClose={props.onClose}
    >
      {boardLoading ? <RightWorkspaceListSkeleton count={1} /> : null}
      {boardUnavailableError ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PresentationIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Board unavailable</EmptyTitle>
            <EmptyDescription>{stringifyError(boardUnavailableError)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {!boardLoading && !boardUnavailableError && !board ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PresentationIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No board yet</EmptyTitle>
            <EmptyDescription>
              Create a board for this notebook to sketch ideas and work visually with Buddy.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={props.onCreateBoard}>
              <PlusIcon data-icon="inline-start" aria-hidden />
              Create board
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}
      {board ? (
        <div className="flex flex-col gap-1">
          <RightWorkspaceSectionLabel>Current board</RightWorkspaceSectionLabel>
          <RightWorkspaceListRow
            icon={PresentationIcon}
            title="Notebook board"
            metadata={formatBoardTimestamp(board.updatedAt)}
            onClick={openBoard}
          />
        </div>
      ) : null}
    </RightWorkspaceDrawerShell>
  )
}
