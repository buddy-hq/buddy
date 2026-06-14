import { createFileRoute } from "@tanstack/react-router"
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
  BenchSurfaceViewer,
  type BenchViewerAction,
} from "@/components/bench/bench-viewer-shell"
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
    <BenchSurfaceViewer title="Loading media">
      <div className="flex h-full items-center justify-center text-sm text-text-weak">
        <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
        Loading media
      </div>
    </BenchSurfaceViewer>
  )
}

function MediaPresentationBenchError() {
  return (
    <BenchSurfaceViewer title="Media unavailable">
      <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
        <AlertCircleIcon className="mr-2 size-4" aria-hidden />
        Media could not be loaded.
      </div>
    </BenchSurfaceViewer>
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
        <BenchSurfaceViewer title={artifact.title}>
          <BenchMediaMessage>No media item is available.</BenchMediaMessage>
        </BenchSurfaceViewer>
      )
    }

    return (
      <MediaPresentationBenchView
        directory={directory}
        artifactID={params.artifactID}
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
  title: string
  item: MediaPresentationItem
}) {
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
