import { Button, toast } from "@buddy/ui"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BenchSurfacePending } from "@/components/bench/bench-surface-pending"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import type { BenchViewerAction } from "@/components/bench/bench-viewer-shell"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { useDirectoryWorkspaceOptional } from "@/components/directory-chat/directory-workspace-context"
import type { ObsidianWikiLinkContext } from "@/components/bench/markdown/plugins/obsidian"
import { MarkdownBenchPage } from "@/components/bench/markdown/page"
import { parseMarkdownBenchProperties } from "@/components/bench/markdown/property-values"
import type { MarkdownBenchDocumentIO } from "@/components/bench/markdown/use-file"
import { AlertCircleIcon, MessageSquareIcon, RefreshCwIcon, Trash2Icon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { benchTabKey } from "@/lib/bench-tabs"
import { createNotesBenchTarget } from "@/lib/bench-targets"
import {
  notesLibraryQueryOptions,
  noteQueryOptions,
  cacheNoteDocument,
  invalidateNotesQueries,
  invalidateNotesSearchQueries,
} from "@/features/notes/queries"
import {
  readNoteDocument,
  readNoteDocumentStatus,
  renameNote,
  saveNoteContent,
  type NoteSummary,
} from "@/features/notes/api"
import { appQueryClient } from "@/state/query-client"
import { requestNoteMessageNavigation } from "./chat-message-navigation"
import { takeNewNoteTitleSelection } from "./create-note"
import { deleteNoteWithUndo } from "./delete-note"
import { resolveNoteImageSrc } from "./note-image-src"
import { createNotesWikiLinkContext } from "./notes-wikilinks"

const EMPTY_NOTES: NoteSummary[] = []

function readChatMessageLink(href: string): { sessionID: string; messageID: string } | undefined {
  try {
    const url = new URL(href)
    if (url.protocol !== "buddy:" || url.hostname !== "chat") return undefined
    const sessionID = decodeURIComponent(url.pathname.replace(/^\//u, ""))
    const messageID = url.searchParams.get("message")
    return sessionID && messageID ? { sessionID, messageID } : undefined
  } catch {
    return undefined
  }
}

function BuddyNoteUnavailable(props: { retry(): void }) {
  return (
    <BenchViewerShell title={language.t("notes.unavailable.title")}>
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircleIcon className="size-5 text-icon-critical-base" aria-hidden />
        <p className="text-sm text-text-weak">{language.t("notes.unavailable.description")}</p>
        <Button type="button" variant="outline" size="sm" onClick={props.retry}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden />
          {language.t("notes.action.tryAgain")}
        </Button>
      </div>
    </BenchViewerShell>
  )
}

/** Resolves a central note to the existing Markdown Bench document source. */
export function NotesMarkdownDocument(props: {
  directory: string
  path: string
  id?: string
  fragment?: string
}) {
  const libraryQuery = useQuery(notesLibraryQueryOptions(props.directory))
  const noteQuery = useQuery(noteQueryOptions(props.path, props.id))
  const openBench = useOpenBench()
  const { controller } = useDirectoryNotebookRouteContext()
  const workspaceController = useDirectoryWorkspaceOptional()?.controller
  const notes = libraryQuery.data?.notes ?? EMPTY_NOTES
  const note = noteQuery.data?.note
  const notePath = note?.relativePath
  const currentPath = notePath ?? props.path
  const noteContent = noteQuery.data?.content
  const noteVersion = noteQuery.data?.version
  const sourceDirectory = noteQuery.data?.sourceDirectory
  const [selectTitleOnOpen, setSelectTitleOnOpen] = useState(false)
  useEffect(() => {
    if (props.id && takeNewNoteTitleSelection(props.id)) setSelectTitleOnOpen(true)
  }, [props.id])
  const sourceSessionID = note?.sessionID

  const openSourceChat = useCallback(
    async (messageID?: string) => {
      if (controller.status !== "ready" || !sourceDirectory || !sourceSessionID) {
        toast.warning(language.t("notes.chat.unavailable"))
        return
      }
      const selected = await controller.selectSession(sourceDirectory, sourceSessionID)
      if (!selected) {
        toast.warning(language.t("notes.chat.unavailable"))
        return
      }
      if (messageID) {
        await requestNoteMessageNavigation({
          directory: sourceDirectory,
          sessionID: sourceSessionID,
          messageID,
        })
      }
    },
    [controller, sourceDirectory, sourceSessionID],
  )

  const trashNoteFile = usePlatform().trashNoteFile
  const noteActions = useMemo<BenchViewerAction[] | undefined>(() => {
    const actions: BenchViewerAction[] = []
    if (sourceSessionID) {
      actions.push({
        label: language.t("notes.action.openChat"),
        icon: <MessageSquareIcon className="size-4" aria-hidden />,
        onClick: () => void openSourceChat(),
      })
    }
    if (note && trashNoteFile) {
      actions.push({
        label: language.t("notes.action.delete"),
        icon: <Trash2Icon className="size-4" aria-hidden />,
        dataAction: "note-delete",
        onClick: () =>
          deleteNoteWithUndo({
            note,
            trashNoteFile,
            closeOpenTab: () =>
              void workspaceController?.execute({
                type: "close-tab",
                tabKey: benchTabKey(
                  createNotesBenchTarget({ relativePath: props.path, id: props.id }),
                ),
              }),
            reopen: () =>
              void openBench({
                directory: props.directory,
                target: createNotesBenchTarget(note),
                mode: BENCH_MODE_REQUEST_POLICY,
                autoOpen: null,
              }),
          }),
      })
    }
    return actions.length > 0 ? actions : undefined
  }, [
    note,
    openBench,
    openSourceChat,
    props.directory,
    props.id,
    props.path,
    sourceSessionID,
    trashNoteFile,
    workspaceController,
  ])

  const openNoteLink = useCallback(
    (href: string) => {
      const source = readChatMessageLink(href)
      if (!source || source.sessionID !== sourceSessionID) return false
      void openSourceChat(source.messageID)
      return true
    },
    [openSourceChat, sourceSessionID],
  )
  const resolveImageSrc = useCallback(
    (src: string) => resolveNoteImageSrc({ notePath: currentPath, src }),
    [currentPath],
  )
  const initialFile = useMemo(
    () =>
      notePath && noteContent !== undefined && noteVersion !== undefined
        ? {
            path: notePath,
            content: noteContent,
            version: noteVersion,
          }
        : undefined,
    [noteContent, notePath, noteVersion],
  )
  const documentIO = useMemo<MarkdownBenchDocumentIO>(
    () => ({
      async read() {
        const document = await readNoteDocument({
          path: currentPath,
          id: props.id,
        })
        return {
          path: document.note.relativePath,
          content: document.content,
          version: document.version,
        }
      },
      async status() {
        const status = await readNoteDocumentStatus({
          path: currentPath,
          id: props.id,
        })
        return {
          path: notePath ?? "",
          exists: status.exists,
          version: status.version,
        }
      },
      async save(input) {
        const document = await saveNoteContent({
          path: currentPath,
          id: props.id,
          content: input.content,
          expectedVersion: input.expectedVersion,
        })
        await cacheNoteDocument(appQueryClient, document)
        void invalidateNotesSearchQueries(appQueryClient)
        void invalidateNotesQueries(appQueryClient, "none")
        return {
          path: document.note.relativePath,
          content: document.content,
          version: document.version,
        }
      },
    }),
    [currentPath, notePath, props.id],
  )

  const createObsidianWikiLinkContext = useCallback(
    (markdown: string): ObsidianWikiLinkContext =>
      createNotesWikiLinkContext({
        directory: libraryQuery.data?.directory ?? "",
        documentPath: currentPath,
        markdown,
        notes,
        openTarget(target) {
          void openBench({
            directory: props.directory,
            target,
            mode: BENCH_MODE_REQUEST_POLICY,
            autoOpen: null,
          })
        },
      }),
    [currentPath, libraryQuery.data?.directory, notes, openBench, props.directory],
  )

  if (libraryQuery.isPending || noteQuery.isPending) return <BenchSurfacePending />
  if (
    (libraryQuery.isError && !libraryQuery.data) ||
    (noteQuery.isError && !noteQuery.data) ||
    !libraryQuery.data ||
    !noteQuery.data ||
    !note ||
    !initialFile
  ) {
    return (
      <BuddyNoteUnavailable
        retry={() => {
          void Promise.all([libraryQuery.refetch(), noteQuery.refetch()])
        }}
      />
    )
  }

  const target = createNotesBenchTarget(note, props.fragment)
  return (
    <MarkdownBenchPage
      directory={props.directory}
      fragment={props.fragment}
      document={{
        storageDirectory: libraryQuery.data.directory,
        path: note.relativePath,
        initialFile,
        target,
        title: note.title,
        actions: noteActions,
        openLink: openNoteLink,
        resolveImageSrc,
        selectTitleOnOpen,
        properties: parseMarkdownBenchProperties(noteQuery.data.properties),
        io: documentIO,
        createWikiLinkContext: createObsidianWikiLinkContext,
        async renameTitle({ title, expectedVersion }) {
          const renamed = await renameNote({
            path: note.relativePath,
            id: note.id,
            title,
            expectedVersion,
          })
          await cacheNoteDocument(appQueryClient, renamed.document, note.relativePath)
          void invalidateNotesSearchQueries(appQueryClient)
          void invalidateNotesQueries(appQueryClient, "none")
          return {
            path: renamed.note.relativePath,
            target: createNotesBenchTarget(renamed.note),
          }
        },
      }}
    />
  )
}
