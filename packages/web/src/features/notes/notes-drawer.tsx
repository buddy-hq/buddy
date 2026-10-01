import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
  toast,
  cn,
} from "@buddy/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { NotesIcon, NoteAddIcon, Trash2Icon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
  RightWorkspaceVirtualList,
} from "@/components/directory-chat/right-workspace-drawer-ui"
import { createNotesBenchTarget } from "@/lib/bench-targets"
import { notesLibraryQueryOptions } from "@/features/notes/queries"
import type { NoteSummary } from "@/features/notes/api"
import { useNoteCaptureSignal } from "@/features/notes/capture-activity"
import { useWorkspaceDrawerSearch, workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import type { RightWorkspaceOpener } from "@/components/directory-chat/right-workspace-open"
import { useUiPreferences } from "@/state/ui-preferences"
import { NOTEBOOK_SEARCH_DEBOUNCE_MS } from "@/state/notebook-search"
import { createNoteAndUpdateCache } from "./create-note"
import { deleteNoteWithUndo } from "./delete-note"

const NOTES_SECTION_ROW_HEIGHT_PX = 28
const NOTES_DOCUMENT_ROW_HEIGHT_PX = 32

type NotesSection = "standalone" | "fromChats"
type NotesDrawerRow =
  | { type: "section"; id: string; label: string }
  | { type: "note"; id: string; note: NoteSummary }

function sectionForNote(note: NoteSummary): NotesSection {
  if (note.type === "buddy-session-note") return "fromChats"
  return "standalone"
}

function notesRows(notes: NoteSummary[]): NotesDrawerRow[] {
  const sections: NotesSection[] = ["standalone", "fromChats"]
  const rows: NotesDrawerRow[] = []
  for (const section of sections) {
    const matches = notes.filter((note) => sectionForNote(note) === section)
    if (matches.length === 0) continue
    if (section === "fromChats") {
      rows.push({
        type: "section",
        id: `section:${section}`,
        label: language.t("notes.section.fromChats"),
      })
    }
    for (const note of matches) {
      rows.push({ type: "note", id: note.relativePath, note })
    }
  }
  return rows
}

const NOTE_HIGHLIGHT_DURATION_MS = 1_200

/** The list sorts by last-updated, so a capture makes its row jump. This explains the jump. */
function useCapturedNoteHighlight(directory: string) {
  const signal = useNoteCaptureSignal(directory)
  const nonce = signal?.nonce
  const relativePath = signal?.relativePath
  const [highlighted, setHighlighted] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!nonce || !relativePath) return
    setHighlighted(relativePath)
    const timeout = window.setTimeout(() => setHighlighted(undefined), NOTE_HIGHLIGHT_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [nonce, relativePath])

  return highlighted
}

/** Main UI entry for browsing, creating, and opening Notes. */
export function NotesDrawer(props: {
  directory: string
  onOpen: RightWorkspaceOpener
  selectedNote?: { path: string; id?: string }
}) {
  const trashNoteFile = usePlatform().trashNoteFile
  const scope = useUiPreferences((state) => state.notesScope)
  const setScope = useUiPreferences((state) => state.setNotesScope)
  const [search, setSearch] = useWorkspaceDrawerSearch(props.directory, "notes")
  const [creating, setCreating] = useState(false)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const allScopeRef = useRef<HTMLButtonElement>(null)
  const normalizedSearch = search.trim()
  const [query, setQuery] = useState(normalizedSearch)
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(normalizedSearch), NOTEBOOK_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [normalizedSearch])
  const libraryQuery = useQuery({
    ...notesLibraryQueryOptions(props.directory, query),
    placeholderData: keepPreviousData,
  })
  const highlightedPath = useCapturedNoteHighlight(props.directory)
  const filteredNotes = useMemo(() => {
    return (libraryQuery.data?.notes ?? []).filter((note) => {
      if (scope === "notebook") {
        const activeNotebookID = libraryQuery.data?.activeNotebookID
        if (!activeNotebookID || note.notebookID !== activeNotebookID) return false
      }
      return true
    })
  }, [libraryQuery.data, scope])
  const rows = useMemo(() => notesRows(filteredNotes), [filteredNotes])
  const selectedRowKey = rows.find(
    (row) =>
      row.type === "note" &&
      (props.selectedNote?.id
        ? props.selectedNote.id === row.note.id
        : props.selectedNote?.path === row.note.relativePath),
  )?.id
  const hasBroaderResults =
    scope === "notebook" &&
    Boolean(query) &&
    (libraryQuery.data?.notes ?? []).some(
      (note) => note.notebookID !== libraryQuery.data?.activeNotebookID,
    )

  function showAllNotes() {
    setScope("all")
    window.requestAnimationFrame(() => allScopeRef.current?.focus())
  }

  async function createNote() {
    if (creating) return
    setCreating(true)
    try {
      const note = await createNoteAndUpdateCache(props.directory)
      await props.onOpen({
        type: "object",
        directory: props.directory,
        target: createNotesBenchTarget(note),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : language.t("notes.createFailed"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <RightWorkspaceDrawerShell
      compact
      title={language.t("notes.library.title")}
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "notes" })}
      activeSelectionKey={selectedRowKey}
      searchLabel={language.t("notes.library.search")}
      searchValue={search}
      searchPending={query !== normalizedSearch || libraryQuery.isFetching}
      searchMaxLength={500}
      action={{
        label: language.t("notes.action.new"),
        icon: NoteAddIcon,
        busy: creating,
        onClick: () => void createNote(),
      }}
      scrollRef={setScrollElement}
      bodyClassName="p-2"
      toolbar={
        <div className="grid grid-cols-2 rounded-lg bg-surface-raised-base p-0.5">
          <Button
            type="button"
            variant={scope === "notebook" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 min-w-0 px-1 text-xs"
            aria-label={language.t("notes.library.thisNotebook")}
            title={language.t("notes.library.thisNotebook")}
            aria-pressed={scope === "notebook"}
            onClick={() => setScope("notebook")}
          >
            <span className="min-w-0 truncate">{language.t("notes.library.notebook")}</span>
          </Button>
          <Button
            ref={allScopeRef}
            type="button"
            variant={scope === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 min-w-0 px-1 text-xs"
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            <span className="min-w-0 truncate">{language.t("notes.library.all")}</span>
          </Button>
        </div>
      }
      onSearchValueChange={setSearch}
    >
      {libraryQuery.isPending ? (
        <RightWorkspaceListSkeleton />
      ) : libraryQuery.isError && !libraryQuery.data ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-text-weak">{language.t("notes.library.loadFailed")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void libraryQuery.refetch()}
          >
            {language.t("notes.action.tryAgain")}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-raised-base text-icon-base">
            <NotesIcon className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-text-base">
            {normalizedSearch
              ? language.t("notes.empty.noMatches")
              : scope === "notebook"
                ? language.t("notes.empty.inNotebook")
                : language.t("notes.empty.noNotes")}
          </p>
          <p className="max-w-48 text-xs text-text-weaker">
            {normalizedSearch
              ? language.t("notes.empty.searchAgain")
              : language.t("notes.empty.description")}
          </p>
          {scope === "notebook" && (!normalizedSearch || hasBroaderResults) ? (
            <Button type="button" variant="link" size="sm" onClick={showAllNotes}>
              {language.t("notes.library.showAll")}
            </Button>
          ) : null}
        </div>
      ) : (
        <RightWorkspaceVirtualList
          gap={0}
          items={rows}
          scrollElement={scrollElement}
          selectedKey={selectedRowKey}
          getKey={(row) => row.id}
          estimateSize={(index) =>
            rows[index]?.type === "section"
              ? NOTES_SECTION_ROW_HEIGHT_PX
              : NOTES_DOCUMENT_ROW_HEIGHT_PX
          }
          renderItem={(row) =>
            row.type === "section" ? (
              <RightWorkspaceSectionLabel>{row.label}</RightWorkspaceSectionLabel>
            ) : (
              <NoteRowContextMenu
                onDelete={
                  trashNoteFile
                    ? () => deleteNoteWithUndo({ note: row.note, trashNoteFile })
                    : undefined
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  title={[
                    row.note.title,
                    scope === "all" ? row.note.notebook : undefined,
                    row.note.relativePath,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  aria-current={row.id === selectedRowKey ? "page" : undefined}
                  className={cn(
                    "h-8 w-full min-w-0 justify-start px-2 text-left text-xs font-normal",
                    row.id === selectedRowKey && "bg-surface-raised-base",
                    row.note.relativePath === highlightedPath && "right-workspace-row-highlight",
                  )}
                  onClick={() => {
                    void props.onOpen({
                      type: "object",
                      directory: props.directory,
                      target: createNotesBenchTarget(row.note),
                    })
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{row.note.title}</span>
                </Button>
              </NoteRowContextMenu>
            )
          }
        />
      )}
    </RightWorkspaceDrawerShell>
  )
}

function NoteRowContextMenu(props: { onDelete?: () => void; children: ReactNode }) {
  if (!props.onDelete) return props.children
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full">{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive" onSelect={props.onDelete}>
            <Trash2Icon aria-hidden />
            {language.t("notes.action.delete")}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
