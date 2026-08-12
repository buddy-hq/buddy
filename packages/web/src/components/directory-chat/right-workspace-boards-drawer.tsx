import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@buddy/ui"
import { PlusIcon, PresentationIcon } from "@/icons/app-icons"
import { stringifyError } from "@/lib/api-client"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { relativeTime } from "@/components/layout/sidebar-helpers"
import { useCreateBoard } from "@/lib/use-create-board"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import type { RightWorkspaceOpenOutcome, RightWorkspaceOpenRequest } from "./right-workspace-open"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListRow,
  RightWorkspaceListSkeleton,
} from "./right-workspace-drawer-ui"

type RightWorkspaceBoardsDrawerProps = {
  directory: string
  onOpen: (request: RightWorkspaceOpenRequest) => Promise<RightWorkspaceOpenOutcome>
}

function formatBoardTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return `Edited ${relativeTime(parsed.getTime())}`
}

export function RightWorkspaceBoardsDrawer(props: RightWorkspaceBoardsDrawerProps) {
  const [search, setSearch] = useState("")
  const boardsQuery = useQuery(workspaceObjectsQueryOptions(props.directory, "whiteboard"))
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const boards = (boardsQuery.data?.objects ?? []).filter(
    (board) => !normalizedSearch || board.title.toLocaleLowerCase().includes(normalizedSearch),
  )
  const boardCreation = useCreateBoard({ directory: props.directory, open: props.onOpen })

  function openBoard(objectID: string) {
    void props.onOpen({
      type: "object",
      directory: props.directory,
      target: createBenchObjectTarget("whiteboard", objectID),
    })
  }

  return (
    <RightWorkspaceDrawerShell
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "boards" })}
      title="Boards"
      searchLabel="Search boards…"
      searchValue={search}
      onSearchValueChange={setSearch}
      action={{
        label: "Create board",
        icon: PlusIcon,
        busy: boardCreation.pending,
        onClick: () => {
          void boardCreation.createBoard()
        },
      }}
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
              disabled={boardCreation.pending}
              onClick={() => {
                void boardCreation.createBoard()
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
