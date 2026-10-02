import { ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, toast } from "@buddy/ui"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import {
  ClipboardCopyIcon,
  CopyIcon,
  FolderOpenIcon,
  LinkIcon,
  type AppIcon,
} from "@/icons/app-icons"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { readNoteDocument, readNoteLocation } from "@/features/notes/api"
import { stringifyError } from "@/lib/api-client"
import {
  BENCH_WORKSPACE_ROOT_NOTES,
  type BenchTabTarget,
  type BenchTarget,
} from "@/lib/bench-targets"
import { isSvgMedia } from "@/lib/svg-media"
import {
  canOpenWorkspaceFileOnBench,
  classifyWorkspaceMedia,
  isWorkspaceReaderPath,
} from "@/lib/workspace-file-media"
import { absoluteWorkspaceFilePath } from "@/lib/workspace-file-paths"
import { objectBenchSurfaceQueryOptions } from "@/state/bench-surface-query"
import { readProjectExplorerEditableFile } from "@/state/chat-actions"
import { useInAppBrowserTabsStore } from "@/state/in-app-browser-tabs-store"

type WorkspaceFileTarget = Extract<BenchTarget, { type: "workspace-file" }>
type ObjectTarget = Extract<BenchTarget, { type: "object" }>

type BenchTabCopyAction = {
  id: string
  label: string
  copiedMessage: string
  icon: AppIcon
  resolveText: () => Promise<string>
}

type BenchTabActions = {
  copy: readonly BenchTabCopyAction[]
  resolveRevealPath: (() => Promise<string>) | null
}

const COPY_PATH_LABEL = "Copy path"
const PATH_COPIED_MESSAGE = "Path copied"
const NO_ACTIONS: BenchTabActions = { copy: [], resolveRevealPath: null }

function hasCopyableTextContents(target: WorkspaceFileTarget): boolean {
  if (target.viewer === "markdown") return true
  if (isWorkspaceReaderPath(target.path)) return false
  if (isSvgMedia({ fileName: target.path })) return true
  const media = { path: target.path, mimeType: undefined, sizeBytes: undefined }
  const classification = classifyWorkspaceMedia(media)
  return (
    classification.renderMode === "file" &&
    classification.mediaKind !== "pdf" &&
    canOpenWorkspaceFileOnBench(media)
  )
}

function workspaceFileActions(directory: string, target: WorkspaceFileTarget): BenchTabActions {
  const isNote = target.root === BENCH_WORKSPACE_ROOT_NOTES
  const note = { path: target.path, id: target.id }
  const resolvePath = isNote
    ? async () => (await readNoteLocation(note)).filepath
    : async () => absoluteWorkspaceFilePath({ directory, path: target.path })
  const resolveContents = isNote
    ? async () => (await readNoteDocument(note)).content
    : async () => (await readProjectExplorerEditableFile({ directory, path: target.path })).content
  const copyPath: BenchTabCopyAction = {
    id: "copy-path",
    label: COPY_PATH_LABEL,
    copiedMessage: PATH_COPIED_MESSAGE,
    icon: ClipboardCopyIcon,
    resolveText: resolvePath,
  }
  const copyContents: BenchTabCopyAction = {
    id: "copy-contents",
    label: "Copy contents",
    copiedMessage: "Contents copied",
    icon: CopyIcon,
    resolveText: resolveContents,
  }
  return {
    copy: isNote || hasCopyableTextContents(target) ? [copyPath, copyContents] : [copyPath],
    resolveRevealPath: resolvePath,
  }
}

function browserActions(target: Extract<BenchTarget, { type: "browser" }>): BenchTabActions {
  return {
    copy: [
      {
        id: "copy-address",
        label: "Copy address",
        copiedMessage: "Address copied",
        icon: LinkIcon,
        resolveText: async () =>
          useInAppBrowserTabsStore.getState().byTabID[target.tabID]?.url ?? target.url,
      },
    ],
    resolveRevealPath: null,
  }
}

function sessionActions(sessionID: string): BenchTabActions {
  return {
    copy: [
      {
        id: "copy-chat-id",
        label: language.t("sidebar.copyThreadIDAction"),
        copiedMessage: language.t("sidebar.threadIDCopied"),
        icon: ClipboardCopyIcon,
        resolveText: async () => sessionID,
      },
    ],
    resolveRevealPath: null,
  }
}

function loadObjectSurface(queryClient: QueryClient, directory: string, target: ObjectTarget) {
  return queryClient.fetchQuery(
    objectBenchSurfaceQueryOptions(
      Object.assign(
        {
          directory,
          kind: target.ref.kind,
          objectID: target.ref.objectID,
          viewID: target.viewID,
        },
        target.ref.revisionID ? { revisionID: target.ref.revisionID } : undefined,
        target.ref.itemID !== null ? { itemID: target.ref.itemID } : undefined,
      ),
    ),
  )
}

function objectActions(
  queryClient: QueryClient,
  directory: string,
  target: ObjectTarget,
): BenchTabActions {
  const loadSurface = () => loadObjectSurface(queryClient, directory, target)
  if (target.ref.kind === "resource") {
    return {
      copy: [
        {
          id: "copy-path",
          label: COPY_PATH_LABEL,
          copiedMessage: PATH_COPIED_MESSAGE,
          icon: ClipboardCopyIcon,
          resolveText: async () => {
            const surface = await loadSurface()
            if (!surface.resourcePath)
              throw new Error("This source has no file to copy a path for.")
            return absoluteWorkspaceFilePath({ directory, path: surface.resourcePath })
          },
        },
      ],
      resolveRevealPath: null,
    }
  }
  if (target.ref.kind === "media-presentation") {
    return {
      copy: [
        {
          id: "copy-path",
          label: COPY_PATH_LABEL,
          copiedMessage: PATH_COPIED_MESSAGE,
          icon: ClipboardCopyIcon,
          resolveText: async () => {
            const view = (await loadSurface()).view
            if (view?.data.renderer !== "media-gallery") {
              throw new Error("This presentation is unavailable.")
            }
            const item =
              view.data.items.find((candidate) => candidate.itemID === target.ref.itemID) ??
              view.data.items[0]
            if (!item) throw new Error("This presentation has no file to copy a path for.")
            return item.source.path
          },
        },
      ],
      resolveRevealPath: null,
    }
  }
  if (target.ref.kind === "mermaid") {
    return {
      copy: [
        {
          id: "copy-source",
          label: "Copy source",
          copiedMessage: "Source copied",
          icon: CopyIcon,
          resolveText: async () => {
            const view = (await loadSurface()).view
            if (view?.data.renderer !== "mermaid") throw new Error("This diagram is unavailable.")
            return view.data.source
          },
        },
      ],
      resolveRevealPath: null,
    }
  }
  return NO_ACTIONS
}

function benchTabActions(
  queryClient: QueryClient,
  directory: string,
  target: BenchTabTarget,
): BenchTabActions {
  switch (target.type) {
    case "workspace-file":
      return workspaceFileActions(directory, target)
    case "browser":
      return browserActions(target)
    case "session":
      return sessionActions(target.sessionID)
    case "object":
      return objectActions(queryClient, directory, target)
  }
}

function reportFailure<TError>(error: TError): void {
  toast.error(stringifyError(error))
}

function copyResolvedText(action: BenchTabCopyAction): void {
  void action
    .resolveText()
    .then((text) => navigator.clipboard.writeText(text))
    .then(() => toast(action.copiedMessage), reportFailure)
}

/** A tab's menu actions, ready to run: what it can copy and, on desktop, where to reveal it. */
type BenchTabMenuActions = {
  copy: readonly BenchTabCopyAction[]
  reveal: { label: string; run: () => void } | null
}

export function useBenchTabActions(directory: string, target: BenchTabTarget): BenchTabMenuActions {
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const actions = benchTabActions(queryClient, directory, target)
  const revealPath = platform.revealPath
  const resolveRevealPath = actions.resolveRevealPath
  return {
    copy: actions.copy,
    reveal:
      revealPath && resolveRevealPath
        ? {
            label: platform.os === "macos" ? "Reveal in Finder" : "Reveal in File Explorer",
            run: () => {
              void resolveRevealPath()
                .then((path) => revealPath(path))
                .catch(reportFailure)
            },
          }
        : null,
  }
}

export function benchTabMenuHasActions(actions: BenchTabMenuActions): boolean {
  return actions.copy.length > 0 || actions.reveal !== null
}

export function BenchTabActionGroups(props: { actions: BenchTabMenuActions }): ReactNode {
  const { copy, reveal } = props.actions
  return (
    <>
      {copy.length > 0 ? (
        <>
          <ContextMenuGroup>
            {copy.map((action) => (
              <ContextMenuItem
                key={action.id}
                data-action={`bench-tab-${action.id}`}
                onSelect={() => copyResolvedText(action)}
              >
                <action.icon aria-hidden />
                {action.label}
              </ContextMenuItem>
            ))}
          </ContextMenuGroup>
          <ContextMenuSeparator />
        </>
      ) : null}
      {reveal ? (
        <>
          <ContextMenuGroup>
            <ContextMenuItem data-action="bench-tab-reveal" onSelect={reveal.run}>
              <FolderOpenIcon aria-hidden />
              {reveal.label}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
        </>
      ) : null}
    </>
  )
}
