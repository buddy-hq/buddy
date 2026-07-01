import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import {
  AlertCircleIcon,
  ClipboardCopyIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  Loader2Icon,
} from "lucide-react"
import { useEffect, useMemo, type ReactNode } from "react"
import {
  objectRef,
  toolRef,
  urlRef,
  workspaceFileRef,
} from "@/components/bench/bench-context-utils"
import { BenchMediaMessage, BenchMediaPreview } from "@/components/bench/bench-media-preview"
import type { BenchMediaRenderMode } from "@/components/bench/bench-media-preview"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import type { BenchReadContextOpenOutput } from "@/components/bench/bench-route-context"
import {
  BenchFloatingControlDock,
  BenchSurfaceViewer,
  BenchViewerShell,
  BenchZoomableViewer,
  type BenchViewerAction,
} from "@/components/bench/bench-viewer-shell"
import { FlashcardBenchReview } from "@/components/bench/flashcard-bench-review"
import { MarkdownBenchPage } from "@/components/bench/markdown-bench-page"
import { QuestionSetBenchReview } from "@/components/bench/question-set-bench-review"
import { SvgBenchView } from "@/components/bench/svg-bench-view"
import { MermaidDiagram } from "@/components/media/renderers/mermaid/mermaid-diagram"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatReadingPage } from "@/components/directory-chat/directory-chat-reading-page"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { WhiteboardPane } from "@/components/whiteboard/whiteboard-pane"
import { usePlatform } from "@/context/platform"
import { stringifyError } from "@/lib/api-client"
import {
  BENCH_CHAT_SEARCH_PARAM,
  defaultBenchObjectViewID,
  isBenchObjectKind,
  readBenchChatLayoutMode,
  type BenchChatLayoutMode,
  type BenchObjectKind,
  type BenchTarget,
} from "@/lib/bench-navigation"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { decodeDirectory } from "@/lib/directory-token"
import { resolveResourceObjectViewerPathWithFallback } from "@/lib/resource-object-viewer-path"
import { resolveAssetUrl } from "@/lib/resource-url"
import { isSvgMedia } from "@/lib/svg-media"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"
import { resourcesQueryOptions } from "@/state/resources-query"
import {
  readProjectExplorerEditableFile,
  type ProjectExplorerEditableFileState,
} from "@/state/chat-actions"
import {
  objectFlashcardDeckPayloadQueryOptions,
  objectMediaAvailabilityQueryOptions,
  objectQuestionSetPayloadQueryOptions,
  objectReadQueryOptions,
  objectViewQueryOptions,
} from "@/state/workspace-objects-query"
import type {
  ObjectFlashcardDeckReadDeckResponse,
  ObjectQuestionSetReadQuestionsResponse,
  ObjectsViewResponse,
} from "@buddy/sdk/types"

type ObjectBenchSearch = {
  view?: string
  revision?: string
  item?: string
  [BENCH_CHAT_SEARCH_PARAM]?: BenchChatLayoutMode
}

type ObjectBenchContextStatus = BenchReadContextOpenOutput["target"]["status"]
type ObjectBenchContextRefs = BenchReadContextOpenOutput["refs"]
type ObjectViewData = ObjectsViewResponse["data"]
type ObjectResourceViewData = Extract<ObjectViewData, { renderer: "resource-reader" }>
type ObjectWhiteboardViewData = Extract<ObjectViewData, { renderer: "whiteboard" }>
type ObjectHtmlWidgetViewData = Extract<ObjectViewData, { renderer: "html-widget" }>
type ObjectMediaGalleryViewData = Extract<ObjectViewData, { renderer: "media-gallery" }>
type ObjectMediaGalleryItem = ObjectMediaGalleryViewData["items"][number]
type ObjectMermaidViewData = Extract<ObjectViewData, { renderer: "mermaid" }>
type ObjectFigureViewData = Extract<ObjectViewData, { renderer: "figure" }>
type ObjectSourceViewData = Extract<ObjectViewData, { renderer: "source" }>
type ObjectContextViewData = Extract<ObjectViewData, { renderer: "context" }>
type ObjectLibraryViewData = Extract<ObjectViewData, { renderer: "library" }>
type ObjectMediaAvailability = {
  status: ObjectMediaGalleryItem["availability"]
  message: string | null
}
type ObjectBenchLoaderData = {
  directory: string
  kind: BenchObjectKind
  objectID: string
  view: ObjectsViewResponse | null
  unavailable?: {
    title: string
    reason: string | null
  }
  resourcePath?: string
  resourceViewer?: "reading" | "markdown"
  resourceMarkdown?: ProjectExplorerEditableFileState
  resourceKey?: string
  questionSet?: ObjectQuestionSetReadQuestionsResponse
  flashcardDeck?: ObjectFlashcardDeckReadDeckResponse
}

const HTML_WIDGET_LIVE_VIEW_REFETCH_INTERVAL_MS = 1500
const OBJECT_RENDER_STATUS_READY = "ready"
const OBJECT_RENDER_STATUS_STALE = "stale"
const OBJECT_RENDER_STATUS_ERROR = "error"

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function renderStatusToContextStatus(
  status:
    | typeof OBJECT_RENDER_STATUS_READY
    | typeof OBJECT_RENDER_STATUS_STALE
    | typeof OBJECT_RENDER_STATUS_ERROR,
): ObjectBenchContextStatus {
  if (status === OBJECT_RENDER_STATUS_ERROR) return "error"
  if (status === OBJECT_RENDER_STATUS_STALE) return "loading"
  return "ready"
}

function resourceStatusToContextStatus(
  status: ObjectResourceViewData["status"],
): ObjectBenchContextStatus {
  switch (status) {
    case "ready":
      return "ready"
    case "preparing":
    case "stale":
      return "loading"
    case "error":
      return "error"
    case "unsupported":
    case "unavailable":
      return "unavailable"
  }
}

function mediaRenderMode(input: {
  mediaType: string
  fileName: string | null
}): BenchMediaRenderMode {
  const mediaType = input.mediaType.toLowerCase()
  const extension = input.fileName ? fileExtensionFromPath(input.fileName) : ""
  if (mediaType === "image" || mediaType.startsWith("image/")) return "image"
  if (mediaType === "video" || mediaType.startsWith("video/")) return "video"
  if (mediaType === "audio" || mediaType.startsWith("audio/")) return "audio"
  if (mediaType === "pdf" || mediaType === "application/pdf" || extension === "pdf") return "pdf"
  return "file"
}

function mediaAvailabilityFromItem(item: ObjectMediaGalleryItem): ObjectMediaAvailability {
  return {
    status: item.availability,
    message: item.availability === "available" ? null : "This media item is not available.",
  }
}

function objectBenchTarget(view: ObjectsViewResponse): Extract<BenchTarget, { type: "object" }> {
  return {
    type: "object",
    ref: view.ref,
    viewID: view.viewID,
  }
}

export const Route = createFileRoute("/$directory/_bench/objects/$kind/$objectID")({
  validateSearch: (search: Record<string, unknown>): ObjectBenchSearch => {
    const chatLayoutMode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM])
    return {
      ...(readString(search.view) ? { view: readString(search.view) } : {}),
      ...(readString(search.revision) ? { revision: readString(search.revision) } : {}),
      ...(readString(search.item) ? { item: readString(search.item) } : {}),
      ...(chatLayoutMode ? { [BENCH_CHAT_SEARCH_PARAM]: chatLayoutMode } : {}),
    }
  },
  loaderDeps: ({ search }) => ({
    view: search.view,
    revision: search.revision,
    item: search.item,
  }),
  loader: async ({ context, deps, params }): Promise<ObjectBenchLoaderData> => {
    const directory = decodeDirectory(params.directory)
    if (!isBenchObjectKind(params.kind)) {
      throw new Error(`Unsupported object kind: ${params.kind}`)
    }

    const kind: BenchObjectKind = params.kind
    const objectID = params.objectID
    const viewID = deps.view ?? defaultBenchObjectViewID(kind)
    const objectRead = await context.queryClient.ensureQueryData(
      objectReadQueryOptions({ directory, kind, objectID }),
    )
    if (objectRead.status === "unavailable") {
      return {
        directory,
        kind,
        objectID,
        view: null,
        unavailable: {
          title: objectRead.tombstone.title ?? "Object unavailable",
          reason: objectRead.tombstone.reason ?? null,
        },
      }
    }
    if (objectRead.status === "error") {
      throw new Error(objectRead.loadError.message)
    }
    const view = await context.queryClient.ensureQueryData(
      objectViewQueryOptions({
        directory,
        kind,
        objectID,
        viewID,
        ...(deps.revision ? { revisionID: deps.revision } : {}),
        ...(deps.item ? { itemID: deps.item } : {}),
      }),
    )

    if (view.data.renderer === "resource-reader") {
      const alias = view.data.alias
      const resourceData = await context.queryClient.ensureQueryData(
        resourcesQueryOptions(directory),
      )
      const record = resourceData.processed.find(
        (resource) => resource.objectID === objectID || resource.alias === alias,
      )
      const viewerPath = resolveResourceObjectViewerPathWithFallback({
        record,
        authoritativeReaderPath: view.data.readerPath,
      })
      const resourceMarkdown =
        viewerPath?.viewer === "markdown"
          ? await readProjectExplorerEditableFile({
              directory,
              path: viewerPath.path,
            })
          : undefined
      return {
        directory,
        kind,
        objectID,
        view,
        ...(viewerPath
          ? {
              resourcePath: viewerPath.path,
              resourceViewer: viewerPath.viewer,
            }
          : {}),
        ...(resourceMarkdown ? { resourceMarkdown } : {}),
        resourceKey: record?.objectID ?? objectID,
      }
    }

    if (view.data.renderer === "question-set") {
      return {
        directory,
        kind,
        objectID,
        view,
        questionSet: await context.queryClient.ensureQueryData(
          objectQuestionSetPayloadQueryOptions({
            directory,
            objectID,
          }),
        ),
      }
    }

    if (view.data.renderer === "flashcard-deck") {
      return {
        directory,
        kind,
        objectID,
        view,
        flashcardDeck: await context.queryClient.ensureQueryData(
          objectFlashcardDeckPayloadQueryOptions({
            directory,
            objectID,
          }),
        ),
      }
    }

    return {
      directory,
      kind,
      objectID,
      view,
    }
  },
  pendingComponent: ObjectBenchPending,
  errorComponent: ObjectBenchError,
  component: ObjectBenchRoute,
})

function ObjectBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Object view is visible on Bench and loading."
      hints={["Try bench_read_context again after the object view finishes loading."]}
    >
      <BenchViewerShell title="Loading object">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading object
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function ObjectBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="Object view is visible on Bench, but it could not be loaded."
      hints={["Check that the object exists and exposes the requested view."]}
    >
      <BenchViewerShell title="Object unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Object view could not be loaded.
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function ObjectBenchContextProvider(props: {
  directory: string
  view: ObjectsViewResponse
  status: ObjectBenchContextStatus
  metadata: string[]
  content: string
  refs?: ObjectBenchContextRefs
  hints?: string[]
  children: ReactNode
}) {
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        targetStatus: props.status,
        title: props.view.title,
        metadata: props.metadata,
        content: props.content,
        refs: props.refs ?? [
          objectRef({
            objectID: props.view.ref.objectID,
            note: `${props.view.ref.kind} object on Bench.`,
          }),
        ],
        hints: props.hints ?? [],
      }),
    }),
    [props.content, props.hints, props.metadata, props.refs, props.status, props.view],
  )
  useRegisterBenchContextProvider({
    target: objectBenchTarget(props.view),
    provider: contextProvider,
  })

  return <>{props.children}</>
}

function ObjectBenchRoute() {
  const loaderData = Route.useLoaderData()
  const search = Route.useSearch()
  const { controller } = useDirectoryNotebookRouteContext()
  const isHtmlWidgetView = loaderData.view?.data.renderer === "html-widget"
  const isSessionBusy =
    controller.status === "ready" ? controller.mainPaneProps.chatState.isBusy : false
  const { data: liveViewData, refetch: refetchLiveView } = useQuery({
    ...objectViewQueryOptions({
      directory: loaderData.directory,
      kind: loaderData.kind,
      objectID: loaderData.objectID,
      viewID: loaderData.view?.viewID ?? search.view ?? defaultBenchObjectViewID(loaderData.kind),
      ...(search.revision ? { revisionID: search.revision } : {}),
      ...(search.item ? { itemID: search.item } : {}),
    }),
    enabled: isHtmlWidgetView,
    initialData: loaderData.view ?? undefined,
    refetchInterval:
      isHtmlWidgetView && isSessionBusy ? HTML_WIDGET_LIVE_VIEW_REFETCH_INTERVAL_MS : false,
  })

  useEffect(() => {
    if (!isHtmlWidgetView || isSessionBusy) return
    void refetchLiveView()
  }, [isHtmlWidgetView, isSessionBusy, refetchLiveView])

  const view = isHtmlWidgetView ? (liveViewData ?? loaderData.view) : loaderData.view
  if (!view) {
    return (
      <UnavailableObjectBenchView
        title={loaderData.unavailable?.title ?? "Object unavailable"}
        reason={loaderData.unavailable?.reason ?? null}
      />
    )
  }

  switch (view.data.renderer) {
    case "resource-reader":
      return (
        <ResourceObjectBenchView
          directory={loaderData.directory}
          view={view}
          data={view.data}
          resourcePath={loaderData.resourcePath}
          resourceViewer={loaderData.resourceViewer}
          resourceMarkdown={loaderData.resourceMarkdown}
          resourceKey={loaderData.resourceKey}
        />
      )
    case "whiteboard":
      return (
        <WhiteboardObjectBenchView directory={loaderData.directory} view={view} data={view.data} />
      )
    case "html-widget":
      return (
        <HtmlWidgetObjectBenchView directory={loaderData.directory} view={view} data={view.data} />
      )
    case "media-gallery":
      return <MediaObjectBenchView directory={loaderData.directory} view={view} data={view.data} />
    case "mermaid":
      return (
        <MermaidObjectBenchView directory={loaderData.directory} view={view} data={view.data} />
      )
    case "figure":
      return (
        <FigureObjectBenchView
          directory={loaderData.directory}
          view={view}
          data={view.data}
        />
      )
    case "question-set":
      return (
        <QuestionSetObjectBenchView
          directory={loaderData.directory}
          view={view}
          questionSet={loaderData.questionSet}
        />
      )
    case "flashcard-deck":
      return (
        <FlashcardDeckObjectBenchView
          directory={loaderData.directory}
          view={view}
          deck={loaderData.flashcardDeck}
        />
      )
    case "source":
      return <SourceObjectBenchView directory={loaderData.directory} view={view} data={view.data} />
    case "context":
      return (
        <ContextObjectBenchView directory={loaderData.directory} view={view} data={view.data} />
      )
    case "library":
      return (
        <LibraryObjectBenchView directory={loaderData.directory} view={view} data={view.data} />
      )
  }
}

function UnavailableObjectBenchView(props: { title: string; reason: string | null }) {
  return (
    <BenchStaticContextProvider
      status="unavailable"
      metadata={["surface_status: unavailable", `reason: ${props.reason ?? "unavailable"}`]}
      content="This managed object is no longer available."
      hints={[]}
    >
      <BenchViewerShell title={props.title}>
        <div className="flex h-full items-center justify-center p-6 text-sm text-text-weak">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Object unavailable
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function ResourceObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectResourceViewData
  resourcePath?: string
  resourceViewer?: "reading" | "markdown"
  resourceMarkdown?: ProjectExplorerEditableFileState
  resourceKey?: string
}) {
  if (props.resourcePath && props.resourceViewer === "reading") {
    return (
      <DirectoryChatReadingPage
        directory={props.directory}
        resourcePath={props.resourcePath}
        resourceKey={props.resourceKey ?? props.data.alias}
        target={objectBenchTarget(props.view)}
      />
    )
  }

  if (props.resourcePath && props.resourceViewer === "markdown" && props.resourceMarkdown) {
    return (
      <ObjectBenchContextProvider
        directory={props.directory}
        view={props.view}
        status="ready"
        metadata={[
          `resource_alias: ${props.data.alias}`,
          `resource_status: ${props.data.status}`,
          `markdown_path: ${props.resourcePath}`,
          `reader_path: ${props.data.readerPath ?? "none"}`,
          `warnings: ${props.data.warnings.length}`,
        ]}
        content={[
          `Resource markdown object: ${props.data.title}`,
          `Path: ${props.resourcePath}`,
          "",
          props.resourceMarkdown.content,
        ].join("\n")}
        refs={[
          objectRef({
            objectID: props.view.ref.objectID,
            note: "Resource object on Bench.",
          }),
          workspaceFileRef({
            path: props.resourcePath,
            note: "Markdown resource path rendered on Bench.",
          }),
        ]}
        hints={["This .md resource is rendered with the Markdown Bench, not Foliate."]}
      >
        <MarkdownBenchPage
          directory={props.directory}
          path={props.resourcePath}
          initialFile={props.resourceMarkdown}
        />
      </ObjectBenchContextProvider>
    )
  }

  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status={resourceStatusToContextStatus(props.data.status)}
      metadata={[
        `resource_alias: ${props.data.alias}`,
        `resource_status: ${props.data.status}`,
        `reader_path: ${props.data.readerPath ?? "none"}`,
        `warnings: ${props.data.warnings.length}`,
      ]}
      content={`Resource reader object: ${props.data.title}\n\nThe source resource path could not be resolved from the local resource index.`}
      hints={[
        "Rebuild or re-add the resource object if the reader cannot resolve its source file.",
      ]}
    >
      <BenchViewerShell title={props.data.title}>
        <BenchMediaMessage className="text-icon-critical-base">
          Resource source file could not be resolved.
        </BenchMediaMessage>
      </BenchViewerShell>
    </ObjectBenchContextProvider>
  )
}

function WhiteboardObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectWhiteboardViewData
}) {
  const { controller } = useDirectoryNotebookRouteContext()
  if (controller.status === "invalid") {
    return <DirectoryInvalidNotebook />
  }

  if (controller.status === "opening") {
    return (
      <ObjectBenchContextProvider
        directory={props.directory}
        view={props.view}
        status="loading"
        metadata={["surface_status: loading"]}
        content="Whiteboard object is visible on Bench and waiting for the notebook to open."
        refs={[
          objectRef({
            objectID: props.view.ref.objectID,
            note: "Whiteboard object on Bench.",
          }),
          toolRef({
            tool: "whiteboard_read_context",
            note: "Reads precise whiteboard state.",
          }),
        ]}
      >
        <BenchViewerShell title={props.view.title}>
          <div className="flex h-full items-center justify-center text-sm text-text-weak">
            Opening notebook
          </div>
        </BenchViewerShell>
      </ObjectBenchContextProvider>
    )
  }

  const chatState = controller.mainPaneProps.chatState
  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status="ready"
      metadata={[
        "surface: whiteboard",
        `session_id: ${props.data.sessionID}`,
        `board_id: ${props.data.boardID ?? "none"}`,
        `element_count: ${props.data.elementCount}`,
      ]}
      content="The whiteboard object is visible on Bench. Use whiteboard_read_context for precise board contents, layout, visible text, and learner edits."
      refs={[
        objectRef({
          objectID: props.view.ref.objectID,
          note: "Whiteboard object on Bench.",
        }),
        toolRef({
          tool: "whiteboard_read_context",
          note: "Reads precise whiteboard state.",
        }),
      ]}
      hints={["Whiteboard board state is domain context, not generic Bench context."]}
    >
      <div data-component="object-whiteboard-bench-page" className="h-full min-h-0 w-full">
        <WhiteboardPane
          directory={props.directory}
          sessionID={props.data.sessionID}
          isBusy={chatState.isBusy}
          messages={chatState.messages}
        />
      </div>
    </ObjectBenchContextProvider>
  )
}

function HtmlWidgetObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectHtmlWidgetViewData
}) {
  const runtimeUrl = useMemo(
    () => resolveAssetUrl(props.data.runtimeUrl),
    [props.data.runtimeUrl],
  )

  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status="ready"
      metadata={[
        `viewport_preset: ${props.data.viewportPreset}`,
        `source_root: ${props.data.sourceRoot}`,
        `entry_path: ${props.data.entryPath}`,
        `source_version: ${props.data.sourceVersion ?? "live"}`,
        `runtime_url: ${props.data.runtimeUrl}`,
      ]}
      content={[
        `HTML widget object: ${props.view.title}`,
        `Entry path: ${props.data.entryPath}`,
        `Source root: ${props.data.sourceRoot}`,
      ].join("\n")}
      refs={[
        objectRef({
          objectID: props.view.ref.objectID,
          note: "HTML widget object on Bench.",
        }),
        ...urlRef({
          url: props.data.runtimeUrl,
          note: "Widget runtime URL.",
        }),
      ]}
      hints={[
        "Live iframe DOM state is unavailable unless a future frontend DOM snapshot provider is added.",
      ]}
    >
      <BenchSurfaceViewer
        title={props.view.title}
        subtitle={props.data.viewportPreset}
        hideHeader
        surfaceClassName="bg-background-base"
      >
        <iframe
          key={runtimeUrl}
          title={props.view.title}
          src={runtimeUrl}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="block h-full w-full border-0 bg-background-base"
        />
      </BenchSurfaceViewer>
    </ObjectBenchContextProvider>
  )
}

function MediaObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectMediaGalleryViewData
}) {
  const search = Route.useSearch()
  const selectedItem =
    props.data.items.find((item) => item.itemID === search.item) ?? props.data.items[0]

  if (!selectedItem) {
    return (
      <ObjectBenchContextProvider
        directory={props.directory}
        view={props.view}
        status="unavailable"
        metadata={["surface_status: unavailable", "media_item_count: 0"]}
        content="Media object is visible on Bench, but no media item is available."
        hints={["The media object has no selectable media items."]}
      >
        <BenchSurfaceViewer title={props.view.title}>
          <BenchMediaMessage>No media item is available.</BenchMediaMessage>
        </BenchSurfaceViewer>
      </ObjectBenchContextProvider>
    )
  }

  return (
    <SelectedMediaObjectBenchView
      directory={props.directory}
      view={props.view}
      layout={props.data.layout}
      item={selectedItem}
    />
  )
}

function SelectedMediaObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  layout: ObjectMediaGalleryViewData["layout"]
  item: ObjectMediaGalleryItem
}) {
  const platform = usePlatform()
  const availabilityQuery = useQuery(
    objectMediaAvailabilityQueryOptions({
      directory: props.directory,
      objectID: props.view.ref.objectID,
      itemID: props.item.itemID,
    }),
  )
  const availability = availabilityQuery.data ?? mediaAvailabilityFromItem(props.item)
  const sourcePath = props.item.source.workspacePath ?? props.item.source.path
  const src = props.item.rawUrl ? resolveAssetUrl(props.item.rawUrl) : undefined
  const title = props.item.title ?? props.item.fileName ?? props.item.itemID
  const renderMode = mediaRenderMode({
    mediaType: props.item.mediaType,
    fileName: props.item.fileName,
  })
  const svg = isSvgMedia({
    fileName: props.item.fileName,
    mimeType: props.item.mimeType,
  })
  const actions = useMemo<BenchViewerAction[]>(
    () => [
      {
        label: "Copy path",
        dataAction: "media-copy-path",
        icon: <ClipboardCopyIcon className="size-4" aria-hidden />,
        onClick: () => {
          void navigator.clipboard.writeText(sourcePath).then(
            () => toast("Path copied"),
            (error: unknown) => toast(stringifyError(error)),
          )
        },
      },
      ...(platform.openPath
        ? [
            {
              label: "Open in default app",
              dataAction: "media-open-default-app",
              icon: <ExternalLinkIcon className="size-4" aria-hidden />,
              onClick: () => {
                void platform.openPath?.(sourcePath)
              },
            } satisfies BenchViewerAction,
          ]
        : []),
      ...(platform.revealPath
        ? [
            {
              label: "Reveal in file manager",
              dataAction: "media-reveal-file",
              icon: <FolderOpenIcon className="size-4" aria-hidden />,
              onClick: () => {
                void platform.revealPath?.(sourcePath)
              },
            } satisfies BenchViewerAction,
          ]
        : []),
    ],
    [platform, sourcePath],
  )

  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status={availability.status === "available" ? "ready" : "unavailable"}
      metadata={[
        `layout: ${props.layout}`,
        `item_id: ${props.item.itemID}`,
        `media_type: ${props.item.mediaType}`,
        `availability: ${availability.status}`,
        `source_path: ${sourcePath}`,
      ]}
      content={[
        `Media object: ${props.view.title}`,
        `Visible item: ${title}`,
        `Source path: ${sourcePath}`,
        `Render mode: ${renderMode}`,
        `Availability: ${availability.status}`,
        availability.message ? `Availability message: ${availability.message}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n")}
      refs={[
        objectRef({
          objectID: props.view.ref.objectID,
          note: "Media object on Bench.",
        }),
        ...(props.item.source.workspacePath
          ? [
              workspaceFileRef({
                path: props.item.source.workspacePath,
                note: "Visible media item path.",
              }),
            ]
          : []),
        ...urlRef({
          url: src,
          note: "Raw visible media item URL.",
        }),
      ]}
      hints={["Use file/read/PDF/image-capable tools to inspect the visible media item."]}
    >
      {availability.status !== "available" ? (
        <BenchSurfaceViewer
          title={props.view.title}
          subtitle={title}
          actions={actions}
          controlsPlacement="dock"
          hideHeader
        >
          <BenchMediaMessage className="text-icon-critical-base">
            {availability.message ?? "This media item is not available."}
          </BenchMediaMessage>
        </BenchSurfaceViewer>
      ) : svg ? (
        <SvgBenchView
          title={props.view.title}
          subtitle={title}
          src={src}
          actions={actions}
        />
      ) : (
        <BenchSurfaceViewer
          title={props.view.title}
          subtitle={title}
          actions={actions}
          controlsPlacement="dock"
          hideHeader
        >
          <BenchMediaPreview
            title={title}
            src={src}
            renderMode={renderMode}
            displayPath={props.item.source.displayPath ?? sourcePath}
          />
        </BenchSurfaceViewer>
      )}
    </ObjectBenchContextProvider>
  )
}

function MermaidObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectMermaidViewData
}) {
  const status = renderStatusToContextStatus(props.data.renderStatus)
  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status={status}
      metadata={[
        `render_status: ${props.data.renderStatus}`,
        `alt: ${props.data.alt}`,
        `caption: ${props.data.caption ?? "none"}`,
        `failed_render_key: ${props.data.failedRenderKey ?? "none"}`,
      ]}
      content={[
        `Mermaid object: ${props.view.title}`,
        `Alt: ${props.data.alt}`,
        props.data.caption ? `Caption: ${props.data.caption}` : undefined,
        `Source:\n\`\`\`mermaid\n${props.data.source}\n\`\`\``,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n\n")}
      refs={[
        objectRef({
          objectID: props.view.ref.objectID,
          note: "Mermaid object on Bench.",
        }),
      ]}
      hints={["Use the Mermaid source when exact diagram structure is needed."]}
    >
      <BenchSurfaceViewer
        title={props.view.title}
        subtitle={props.data.caption ?? props.data.alt}
        hideHeader
        surfaceClassName="bg-background-base"
      >
        <MermaidDiagram
          source={props.data.source}
          alt={props.data.alt}
          directory={props.directory}
          objectID={props.view.ref.objectID}
          revisionID={props.view.ref.revisionID}
          viewportMode="bench"
          presentation="interactive"
          showRawSourceOnError
          hideFullscreenAction
          minimalActions
          renderWrapper={(diagram, actions) => (
            <div className="relative h-full min-h-0">
              {diagram}
              {actions ? <BenchFloatingControlDock>{actions}</BenchFloatingControlDock> : null}
            </div>
          )}
        />
      </BenchSurfaceViewer>
    </ObjectBenchContextProvider>
  )
}

function FigureObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectFigureViewData
}) {
  const subtitle = props.data.caption ?? props.data.alt ?? undefined
  const src = props.data.svgUrl ? resolveAssetUrl(props.data.svgUrl) : undefined

  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status={renderStatusToContextStatus(props.data.renderStatus)}
      metadata={[
        `render_status: ${props.data.renderStatus}`,
        `alt: ${props.data.alt ?? "none"}`,
        `caption: ${props.data.caption ?? "none"}`,
        `svg_url: ${props.data.svgUrl ?? "none"}`,
      ]}
      content={[
        `Figure object: ${props.view.title}`,
        props.data.alt ? `Alt: ${props.data.alt}` : undefined,
        props.data.caption ? `Caption: ${props.data.caption}` : undefined,
        props.data.source ? `Source:\n${props.data.source}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n\n")}
      refs={[
        objectRef({
          objectID: props.view.ref.objectID,
          note: "Figure object on Bench.",
        }),
        ...urlRef({
          url: props.data.svgUrl ?? undefined,
          note: "Raw SVG URL.",
        }),
      ]}
      hints={["Use the raw SVG view when exact visual source is needed."]}
    >
      <SvgBenchView title={props.view.title} subtitle={subtitle} src={src} />
    </ObjectBenchContextProvider>
  )
}

function QuestionSetObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  questionSet?: ObjectQuestionSetReadQuestionsResponse
}) {
  const questionSet = props.questionSet
  if (!questionSet) {
    return (
      <ObjectBenchContextProvider
        directory={props.directory}
        view={props.view}
        status="error"
        metadata={["surface_status: error"]}
        content="Question set object is visible on Bench, but its review payload did not load."
      >
        <BenchViewerShell title={props.view.title}>
          <BenchMediaMessage className="text-icon-critical-base">
            Question set could not be loaded.
          </BenchMediaMessage>
        </BenchViewerShell>
      </ObjectBenchContextProvider>
    )
  }

  return (
    <QuestionSetBenchReview
      directory={props.directory}
      target={objectBenchTarget(props.view)}
      questionSet={questionSet}
      onSubmit={async (answers) => {
        const response = await getBuddyClient(props.directory).objectQuestionSet.submitAttempt({
          directory: props.directory,
          objectID: questionSet.objectID,
          answers: questionSet.questions.map((question) => ({
            questionID: question.id,
            selectedChoiceIds: answers[question.id] ?? [],
          })),
        })
        return requireBuddyData(response).result
      }}
    />
  )
}

function FlashcardDeckObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  deck?: ObjectFlashcardDeckReadDeckResponse
}) {
  if (!props.deck) {
    return (
      <ObjectBenchContextProvider
        directory={props.directory}
        view={props.view}
        status="error"
        metadata={["surface_status: error"]}
        content="Flashcard deck object is visible on Bench, but its review payload did not load."
      >
        <BenchViewerShell title={props.view.title}>
          <BenchMediaMessage className="text-icon-critical-base">
            Flashcards could not be loaded.
          </BenchMediaMessage>
        </BenchViewerShell>
      </ObjectBenchContextProvider>
    )
  }

  return (
    <FlashcardBenchReview
      directory={props.directory}
      objectID={props.deck.objectID}
      target={objectBenchTarget(props.view)}
      deck={props.deck}
    />
  )
}

function SourceObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectSourceViewData
}) {
  const content = props.data.content
    ? `Source file: ${props.data.content.path}\n\n${props.data.content.text}`
    : `Source root: ${props.data.sourceRoot}\n\nFiles:\n${props.data.files
        .map((file) => `- ${file.kind}: ${file.path}`)
        .join("\n")}`
  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status="ready"
      metadata={[
        `source_root: ${props.data.sourceRoot}`,
        `entry_path: ${props.data.entryPath ?? "none"}`,
        `file_count: ${props.data.files.length}`,
      ]}
      content={content}
    >
      <BenchViewerShell title={props.view.title} subtitle={props.data.entryPath ?? undefined}>
        <pre className="h-full overflow-auto whitespace-pre-wrap p-6 text-xs text-text-base">
          <code>{content}</code>
        </pre>
      </BenchViewerShell>
    </ObjectBenchContextProvider>
  )
}

function ContextObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectContextViewData
}) {
  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status="ready"
      metadata={props.data.refs.map((ref) => `${ref.label}: ${ref.value}`)}
      content={props.data.content}
    >
      <BenchViewerShell title={props.view.title}>
        <div className="h-full overflow-auto p-6">
          <pre className="whitespace-pre-wrap text-sm text-text-base">{props.data.content}</pre>
        </div>
      </BenchViewerShell>
    </ObjectBenchContextProvider>
  )
}

function LibraryObjectBenchView(props: {
  directory: string
  view: ObjectsViewResponse
  data: ObjectLibraryViewData
}) {
  return (
    <ObjectBenchContextProvider
      directory={props.directory}
      view={props.view}
      status="ready"
      metadata={props.data.metrics.map((metric) => `${metric.label}: ${String(metric.value)}`)}
      content={[
        props.data.title,
        props.data.subtitle,
        props.data.badge ? `Badge: ${props.data.badge}` : undefined,
        ...props.data.metrics.map((metric) => `${metric.label}: ${String(metric.value)}`),
      ]
        .filter((line): line is string => typeof line === "string" && line.length > 0)
        .join("\n")}
    >
      <BenchZoomableViewer title={props.data.title} subtitle={props.data.subtitle ?? undefined}>
        <div className="w-[32rem] rounded-lg border border-border-base bg-surface-base p-5">
          <div className="text-sm font-semibold text-text-strong">{props.data.title}</div>
          {props.data.subtitle ? (
            <div className="mt-1 text-xs text-text-weak">{props.data.subtitle}</div>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            {props.data.metrics.map((metric) => (
              <div key={metric.label} className="rounded-md border border-border-base p-3">
                <dt className="text-text-weak">{metric.label}</dt>
                <dd className="mt-1 font-medium text-text-base">{String(metric.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </BenchZoomableViewer>
    </ObjectBenchContextProvider>
  )
}
