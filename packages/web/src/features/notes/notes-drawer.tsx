import { Button, toast } from "@buddy/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { FileTextIcon, MessageSquareIcon, NoteIcon, PlusIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListRow,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
  RightWorkspaceVirtualList,
} from "@/components/directory-chat/right-workspace-drawer-ui"
import { createNotesBenchTarget } from "@/lib/bench-targets"
import { notesLibraryQueryOptions } from "@/features/notes/queries"
import type { NoteSummary } from "@/features/notes/api"
import { useNoteCaptureSignal } from "@/features/notes/capture-activity"
import { workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import type { RightWorkspaceOpener } from "@/components/directory-chat/right-workspace-open"
import { createNoteAndUpdateCache } from "./create-note"

const NOTES_SECTION_ROW_HEIGHT_PX = 28
const NOTES_DOCUMENT_ROW_HEIGHT_PX = 56

type NotesScope = "notebook" | "all"
type NotesSection = "standalone" | "fromChats"
type NotesDrawerRow =
  | { type: "section"; id: string; label: string }
  | { type: "note"; id: string; note: NoteSummary }

function sectionForNote(note: NoteSummary): NotesSection {
  if (note.type === "buddy-session-note") return "fromChats"
  return "standalone"
}

function sectionLabel(section: NotesSection) {
  if (section === "fromChats") return language.t("notes.section.fromChats")
  return language.t("notes.section.standalone")
}

function iconForNote(note: NoteSummary) {
  if (note.type === "buddy-session-note") return MessageSquareIcon
  return FileTextIcon
}

function notesRows(notes: NoteSummary[]): NotesDrawerRow[] {
  const sections: NotesSection[] = ["standalone", "fromChats"]
  const rows: NotesDrawerRow[] = []
  for (const section of sections) {
    const matches = notes.filter((note) => sectionForNote(note) === section)
    if (matches.length === 0) continue
    rows.push({ type: "section", id: `section:${section}`, label: sectionLabel(section) })
    for (const note of matches) {
      rows.push({ type: "note", id: note.relativePath, note })
    }
  }
  return rows
}

function noteMetadata(note: NoteSummary, showNotebook: boolean) {
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(note.updatedAt)
  if (!showNotebook) return date
  if (note.kind === "plain" || !note.notebook) return date
  return note.notebookAvailable
    ? `${note.notebook} · ${date}`
    : language.t("notes.library.missingNotebook", { date })
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
export function NotesDrawer(props: { directory: string; onOpen: RightWorkspaceOpener }) {
  const [scope, setScope] = useState<NotesScope>("notebook")
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const libraryQuery = useQuery(notesLibraryQueryOptions(props.directory))
  const highlightedPath = useCapturedNoteHighlight(props.directory)
  const filteredNotes = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return (libraryQuery.data?.notes ?? []).filter((note) => {
      if (scope === "notebook") {
        const activeNotebookID = libraryQuery.data?.activeNotebookID
        if (!activeNotebookID || note.notebookID !== activeNotebookID) return false
      }
      if (!normalizedSearch) return true
      return [note.title, note.notebook ?? "", note.relativePath].some((value) =>
        value.toLocaleLowerCase().includes(normalizedSearch),
      )
    })
  }, [libraryQuery.data, scope, search])
  const rows = useMemo(() => notesRows(filteredNotes), [filteredNotes])

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
      title={language.t("notes.library.title")}
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "notes" })}
      searchLabel={language.t("notes.library.search")}
      searchValue={search}
      searchPending={libraryQuery.isFetching && !libraryQuery.isPending}
      action={{
        label: language.t("notes.action.new"),
        icon: PlusIcon,
        busy: creating,
        onClick: () => void createNote(),
      }}
      scrollRef={setScrollElement}
      toolbar={
        <div className="grid grid-cols-2 rounded-lg bg-surface-raised-base p-0.5">
          <Button
            type="button"
            variant={scope === "notebook" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setScope("notebook")}
          >
            {language.t("notes.library.thisNotebook")}
          </Button>
          <Button
            type="button"
            variant={scope === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setScope("all")}
          >
            {language.t("notes.library.all")}
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
            <NoteIcon className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-text-base">
            {search ? language.t("notes.empty.noMatches") : language.t("notes.empty.noNotes")}
          </p>
          <p className="max-w-48 text-xs text-text-weaker">
            {search ? language.t("notes.empty.searchAgain") : language.t("notes.empty.description")}
          </p>
        </div>
      ) : (
        <RightWorkspaceVirtualList
          items={rows}
          scrollElement={scrollElement}
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
              <RightWorkspaceListRow
                title={row.note.title}
                metadata={noteMetadata(row.note, scope === "all")}
                icon={iconForNote(row.note)}
                highlighted={row.note.relativePath === highlightedPath}
                onClick={() => {
                  void props.onOpen({
                    type: "object",
                    directory: props.directory,
                    target: createNotesBenchTarget(row.note),
                  })
                }}
              />
            )
          }
        />
      )}
    </RightWorkspaceDrawerShell>
  )
}
