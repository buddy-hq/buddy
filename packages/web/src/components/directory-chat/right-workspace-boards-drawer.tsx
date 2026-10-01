import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useWorkspaceDrawerSearch, workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  cn,
} from "@buddy/ui"
import { PlusIcon, PresentationIcon } from "@/icons/app-icons"
import { scoreNotebookSearchText } from "@/state/notebook-search"
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
  compact?: boolean
  selectedObjectID?: string
  directory: string
  onOpen: (request: RightWorkspaceOpenRequest) => Promise<RightWorkspaceOpenOutcome>
}

function formatBoardTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return `Edited ${relativeTime(parsed.getTime())}`
}

export function RightWorkspaceBoardsDrawer(props: RightWorkspaceBoardsDrawerProps) {
  const [search, setSearch] = useWorkspaceDrawerSearch(props.directory, "boards")
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const revealedSelectionRef = useRef<{ key: string; element: HTMLDivElement }>()
  const boardsQuery = useQuery(workspaceObjectsQueryOptions(props.directory, "whiteboard"))
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const boards = useMemo(
    () =>
      (boardsQuery.data?.objects ?? []).filter(
        (board) =>
          scoreNotebookSearchText({ query: normalizedSearch, title: board.title }) !== undefined,
      ),
    [boardsQuery.data, normalizedSearch],
  )
  const boardCreation = useCreateBoard({ directory: props.directory, open: props.onOpen })

  useEffect(() => {
    if (!props.selectedObjectID || !scrollElement) return
    if (
      revealedSelectionRef.current?.key === props.selectedObjectID &&
      revealedSelectionRef.current.element === scrollElement
    )
      return
    const row = scrollElement.querySelector('[aria-current="page"]')
    if (!row) return
    row.scrollIntoView?.({ block: "nearest" })
    revealedSelectionRef.current = { key: props.selectedObjectID, element: scrollElement }
  }, [boards, props.selectedObjectID, scrollElement])

  function openBoard(objectID: string) {
    void props.onOpen({
      type: "object",
      directory: props.directory,
      target: createBenchObjectTarget("whiteboard", objectID),
    })
  }

  return (
    <RightWorkspaceDrawerShell
      compact={props.compact}
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "boards" })}
      activeSelectionKey={props.selectedObjectID}
      scrollRef={setScrollElement}
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
        props.compact ? (
          <p className="px-2 py-3 text-xs text-text-weak">
            {normalizedSearch ? "No matching boards" : "No boards yet"}
          </p>
        ) : (
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
        )
      ) : null}
      {boards.length > 0 ? (
        <div className="flex flex-col gap-1">
          {boards.map((board) =>
            props.compact ? (
              <button
                key={board.objectID}
                type="button"
                aria-current={props.selectedObjectID === board.objectID ? "page" : undefined}
                title={board.title}
                className={cn(
                  "flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base",
                  props.selectedObjectID === board.objectID
                    ? "bg-surface-raised-base hover:bg-surface-raised-base-hover"
                    : "hover:bg-surface-base",
                )}
                onClick={() => openBoard(board.objectID)}
              >
                <PresentationIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{board.title}</span>
              </button>
            ) : (
              <RightWorkspaceListRow
                key={board.objectID}
                icon={PresentationIcon}
                title={board.title}
                metadata={formatBoardTimestamp(board.updatedAt)}
                active={props.selectedObjectID === board.objectID}
                onClick={() => openBoard(board.objectID)}
              />
            ),
          )}
        </div>
      ) : null}
    </RightWorkspaceDrawerShell>
  )
}
