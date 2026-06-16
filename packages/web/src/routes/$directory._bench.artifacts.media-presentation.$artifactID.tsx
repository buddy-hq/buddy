import { createFileRoute, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  ClipboardCopyIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  Loader2Icon,
} from "lucide-react"
import { useMemo } from "react"
import { toast } from "@buddy/ui"
import {
  artifactRef,
  artifactTarget,
  routeString,
  urlRef,
  workspaceFileRef,
} from "@/components/bench/bench-context-utils"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import {
  BenchSurfaceViewer,
  type BenchViewerAction,
} from "@/components/bench/bench-viewer-shell"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { BenchMediaMessage, BenchMediaPreview } from "@/components/bench/bench-media-preview"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { usePlatform } from "@/context/platform"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { stringifyError } from "@/lib/api-client"
import { resolveAssetUrl } from "@/lib/resource-url"
import { decodeDirectory } from "@/lib/directory-token"
import type { MediaPresentationReadResponse } from "@buddy/sdk/types"

type MediaPresentationBenchSearch = {
  item?: string
}

type MediaPresentationItem = MediaPresentationReadResponse["summary"]["items"][number]

export const Route = createFileRoute(
  "/$directory/_bench/artifacts/media-presentation/$artifactID",
)({
  validateSearch: (search: Record<string, unknown>): MediaPresentationBenchSearch => ({
    item: typeof search.item === "string" ? search.item : undefined,
  }),
  loader: async ({ params }) => {
    const directory = decodeDirectory(params.directory)
    return requireBuddyData(
      await getBuddyClient(directory).mediaPresentation.read({
        directory,
        artifactID: params.artifactID,
      }),
    )
  },
  pendingComponent: MediaPresentationBenchPending,
  errorComponent: MediaPresentationBenchError,
  component: MediaPresentationBenchRoute,
})

function MediaPresentationBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Media presentation is visible on Bench and loading."
      hints={["Try bench_read_context again after the media presentation finishes loading."]}
    >
      <BenchSurfaceViewer title="Loading media">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading media
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}

function MediaPresentationBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="Media presentation is visible on Bench, but it could not be loaded."
      hints={["Check that the media presentation artifact exists."]}
    >
      <BenchSurfaceViewer title="Media unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Media could not be loaded.
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}

function MediaPresentationBenchRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const artifact = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    const selectedItem =
      artifact.summary.items.find((item) => item.id === search.item) ?? artifact.summary.items[0]
    if (!selectedItem) {
      return (
        <BenchStaticContextProvider
          title={artifact.title}
          status="unavailable"
          metadata={[
            "surface_status: unavailable",
            "media_item_count: 0",
          ]}
          content="Media presentation is visible on Bench, but no media item is available."
          hints={["The media presentation artifact has no selectable media items."]}
        >
          <BenchSurfaceViewer title={artifact.title}>
            <BenchMediaMessage>No media item is available.</BenchMediaMessage>
          </BenchSurfaceViewer>
        </BenchStaticContextProvider>
      )
    }

    return (
      <MediaPresentationBenchView
        directory={directory}
        artifactID={params.artifactID}
        layout={artifact.summary.layout}
        title={artifact.title}
        item={selectedItem}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}

function MediaPresentationBenchView(props: {
  directory: string
  artifactID: string
  layout: MediaPresentationReadResponse["summary"]["layout"]
  title: string
  item: MediaPresentationItem
}) {
  const location = useLocation()
  const platform = usePlatform()
  const availabilityQuery = useQuery({
    queryKey: [
      "bench",
      "media-presentation",
      props.directory,
      props.artifactID,
      props.item.id,
      "availability",
    ] as const,
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).mediaPresentation.availability({
          directory: props.directory,
          artifactID: props.artifactID,
          itemID: props.item.id,
        }),
      ),
  })
  const availability = availabilityQuery.data ?? props.item.availability
  const src = props.item.rawUrl ? resolveAssetUrl(props.item.rawUrl) : undefined
  const subtitle = `${props.item.fileName} · ${props.item.mediaKind}`
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: artifactTarget({
          artifactKind: "media-presentation",
          directory: props.directory,
          title: props.title,
          artifactID: props.artifactID,
          itemID: props.item.id,
          route: routeString({
            pathname: location.pathname,
            searchStr: location.searchStr,
          }),
          status: availability.status === "available" ? "ready" : "unavailable",
        }),
        metadata: [
          `layout: ${props.layout}`,
          `item_filename: ${props.item.fileName}`,
          `media_kind: ${props.item.mediaKind}`,
          `render_mode: ${props.item.renderMode}`,
          `mime_type: ${props.item.mimeType ?? "unknown"}`,
          `availability: ${availability.status}`,
          `size_bytes: ${props.item.sizeBytes ?? "unknown"}`,
          `modified_at: ${props.item.modifiedAt ?? "unknown"}`,
        ],
        content: [
          `Media presentation: ${props.title}`,
          `Visible item: ${props.item.fileName}`,
          `Display path: ${props.item.displayPath}`,
          `Render mode: ${props.item.renderMode}`,
          `Availability: ${availability.status}`,
          availability.message ? `Availability message: ${availability.message}` : undefined,
        ]
          .filter((line): line is string => line !== undefined)
          .join("\n"),
        refs: [
          artifactRef({
            artifactID: props.artifactID,
            note: "Media presentation artifact on Bench.",
          }),
          ...(props.item.workspacePath
            ? [
                workspaceFileRef({
                  path: props.item.workspacePath,
                  note: "Visible media item path.",
                }),
              ]
            : []),
          ...urlRef({
            url: src,
            note: "Raw visible media item URL.",
          }),
        ],
        hints: ["Use file/read/PDF/image-capable tools to inspect the visible media item."],
      }),
    }),
    [
      availability.message,
      availability.status,
      location.pathname,
      location.searchStr,
      props.artifactID,
      props.directory,
      props.item,
      props.layout,
      props.title,
      src,
    ],
  )
  useRegisterBenchContextProvider(contextProvider)
  const actions = useMemo<BenchViewerAction[]>(
    () => [
      {
        label: "Copy path",
        dataAction: "media-copy-path",
        icon: <ClipboardCopyIcon className="size-4" aria-hidden />,
        onClick: () => {
          void navigator.clipboard.writeText(props.item.absolutePath).then(
            () => toast("Path copied"),
            (error: unknown) => toast(stringifyError(error)),
          )
        },
      },
      ...(props.item.actionCapabilities.canOpenDefaultApp && platform.openPath
        ? [
            {
              label: "Open in default app",
              dataAction: "media-open-default-app",
              icon: <ExternalLinkIcon className="size-4" aria-hidden />,
              onClick: () => {
                void platform.openPath?.(props.item.absolutePath)
              },
            } satisfies BenchViewerAction,
          ]
        : []),
      ...(props.item.actionCapabilities.canRevealInFileManager && platform.revealPath
        ? [
            {
              label: "Reveal in file manager",
              dataAction: "media-reveal-file",
              icon: <FolderOpenIcon className="size-4" aria-hidden />,
              onClick: () => {
                void platform.revealPath?.(props.item.absolutePath)
              },
            } satisfies BenchViewerAction,
          ]
        : []),
    ],
    [platform, props.item],
  )

  return (
    <BenchSurfaceViewer title={props.title} subtitle={subtitle} actions={actions}>
      {availability.status !== "available" ? (
        <BenchMediaMessage className="text-icon-critical-base">
          {availability.message ?? "This media item is not available."}
        </BenchMediaMessage>
      ) : (
        <BenchMediaPreview
          title={props.item.fileName}
          src={src}
          renderMode={props.item.renderMode}
          displayPath={props.item.displayPath}
        />
      )}
    </BenchSurfaceViewer>
  )
}
