import { Button } from "@buddy/ui"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { BenchSurfacePending } from "@/components/bench/bench-surface-pending"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import type { ObsidianWikiLinkContext } from "@/components/bench/markdown/plugins/obsidian"
import { MarkdownBenchPage } from "@/components/bench/markdown/page"
import { parseMarkdownBenchProperties } from "@/components/bench/markdown/property-values"
import type { MarkdownBenchDocumentIO } from "@/components/bench/markdown/use-file"
import { AlertCircleIcon, RefreshCwIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { createNotesBenchTarget } from "@/lib/bench-targets"
import {
  notesLibraryQueryOptions,
  noteQueryOptions,
  cacheNoteDocument,
  invalidateNotesQueries,
} from "@/features/notes/queries"
import {
  readNoteDocument,
  readNoteDocumentStatus,
  renameNote,
  saveNoteContent,
  type NoteSummary,
} from "@/features/notes/api"
import { appQueryClient } from "@/state/query-client"
import { createNotesWikiLinkContext } from "./notes-wikilinks"

const EMPTY_NOTES: NoteSummary[] = []

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
  fragment?: string
}) {
  const libraryQuery = useQuery(notesLibraryQueryOptions(props.directory))
  const noteQuery = useQuery(noteQueryOptions(props.path))
  const openBench = useOpenBench()
  const notes = libraryQuery.data?.notes ?? EMPTY_NOTES
  const note = noteQuery.data?.note
  const notePath = note?.relativePath
  const noteContent = noteQuery.data?.content
  const noteVersion = noteQuery.data?.version
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
          path: props.path,
        })
        return {
          path: document.note.relativePath,
          content: document.content,
          version: document.version,
        }
      },
      async status() {
        const status = await readNoteDocumentStatus({
          path: props.path,
        })
        return {
          path: note?.relativePath ?? "",
          exists: status.exists,
          version: status.version,
        }
      },
      async save(input) {
        const document = await saveNoteContent({
          path: props.path,
          content: input.content,
          expectedVersion: input.expectedVersion,
        })
        await cacheNoteDocument(appQueryClient, document)
        void invalidateNotesQueries(appQueryClient, "none")
        return {
          path: document.note.relativePath,
          content: document.content,
          version: document.version,
        }
      },
    }),
    [note?.relativePath, props.path],
  )

  const createObsidianWikiLinkContext = useCallback(
    (markdown: string): ObsidianWikiLinkContext =>
      createNotesWikiLinkContext({
        directory: libraryQuery.data?.directory ?? "",
        documentPath: props.path,
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
    [libraryQuery.data?.directory, notes, openBench, props.directory, props.path],
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
        properties: parseMarkdownBenchProperties(noteQuery.data.properties),
        io: documentIO,
        createWikiLinkContext: createObsidianWikiLinkContext,
        async renameTitle({ title, expectedVersion }) {
          const renamed = await renameNote({
            path: note.relativePath,
            title,
            expectedVersion,
          })
          await cacheNoteDocument(appQueryClient, renamed.document, note.relativePath)
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
