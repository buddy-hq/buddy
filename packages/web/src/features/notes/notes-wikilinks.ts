import {
  collectObsidianWikiLinkTargets,
  type ObsidianEmbeddedMarkdownLoader,
  type ObsidianLinkResolution,
  type ObsidianWikiLinkContext,
} from "@/components/bench/markdown/plugins/obsidian"
import { createNotesBenchTarget, type BenchTarget } from "@/lib/bench-targets"
import { readNoteDocument, type NoteSummary } from "./api"
import { notesQueryKeys } from "./queries"

const MARKDOWN_EXTENSION = ".md" as const

const NOTES_EMBEDDED_MARKDOWN_LOADER: ObsidianEmbeddedMarkdownLoader = {
  queryKey: ({ path }) => notesQueryKeys.note(path),
  read: ({ path }) => readNoteDocument({ path }),
}

function noteWikilinkTarget(relativePath: string) {
  return relativePath.endsWith(MARKDOWN_EXTENSION)
    ? relativePath.slice(0, -MARKDOWN_EXTENSION.length)
    : relativePath
}

function noteForWikilinkTarget(notes: NoteSummary[], target: string, documentPath: string) {
  const pathTarget = target.split("#", 1)[0] ?? target
  if (!pathTarget) return notes.find((note) => note.relativePath === documentPath)
  return notes.find((note) => {
    const noteTarget = noteWikilinkTarget(note.relativePath)
    const basename = noteTarget.split("/").at(-1)
    return noteTarget === pathTarget || basename === pathTarget
  })
}

function noteResolutions(
  markdown: string,
  notes: NoteSummary[],
  documentPath: string,
): ReadonlyMap<string, ObsidianLinkResolution> {
  const resolutions = new Map<string, ObsidianLinkResolution>()
  for (const target of collectObsidianWikiLinkTargets(markdown)) {
    const note = noteForWikilinkTarget(notes, target, documentPath)
    if (!note) {
      resolutions.set(target, { target, status: "unresolved" })
      continue
    }
    const resolution: ObsidianLinkResolution = {
      target,
      status: "resolved",
      path: note.relativePath,
      kind: "markdown",
    }
    const fragment = target.includes("#") ? target.slice(target.indexOf("#") + 1) : undefined
    if (fragment) resolution.fragment = fragment
    resolutions.set(target, resolution)
  }
  return resolutions
}

export function createNotesWikiLinkContext(input: {
  directory: string
  documentPath: string
  markdown: string
  notes: NoteSummary[]
  openTarget(target: BenchTarget): void
}): ObsidianWikiLinkContext {
  return {
    directory: input.directory,
    documentPath: input.documentPath,
    compatible: true,
    resolutions: noteResolutions(input.markdown, input.notes, input.documentPath),
    embeddedMarkdownLoader: NOTES_EMBEDDED_MARKDOWN_LOADER,
    openResolution(resolution) {
      if (resolution.status !== "resolved" || !resolution.path) return
      const note = input.notes.find((candidate) => candidate.relativePath === resolution.path)
      if (note) input.openTarget(createNotesBenchTarget(note, resolution.fragment))
    },
  }
}
