import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import {
  FoliateReader,
  type FoliateReaderLocation,
  type FoliateReaderSelection,
  type FoliateReaderSource,
} from "@/components/readers/foliate-reader"
import type { ReaderAnnotation } from "@/components/readers/foliate-reader-types"
import { language } from "@/context/language"
import {
  isSupportedReadingResourcePath,
  readingResourceBlobQueryOptions,
} from "@/state/resources-query"

type DirectoryChatReadingReaderPaneProps = {
  directory: string
  resourceName: string
  resourcePath: string
  resourceID?: string
  resourceStatus?: "preparing" | "ready" | "unsupported" | "error" | "stale" | "unprocessed"
  onLocationChange?: (location: FoliateReaderLocation) => void
  onChatSelection?: (selection: FoliateReaderSelection) => void
  onChatSelectionRemoved?: (selectionKey: string) => void
  onAnnotationsChange?: (annotations: ReaderAnnotation[]) => void
}

const NOTEBOOK_PERSISTENCE_SUFFIX_PREFIX = "notebook"

const RESOURCE_STATUS_PREPARING = "preparing"
const RESOURCE_STATUS_UNSUPPORTED = "unsupported"
const RESOURCE_STATUS_ERROR = "error"

export function DirectoryChatReadingReaderPane(props: DirectoryChatReadingReaderPaneProps) {
  const resourceSupported = isSupportedReadingResourcePath(props.resourcePath)
  const resourceBlocked =
    props.resourceStatus === RESOURCE_STATUS_PREPARING ||
    props.resourceStatus === RESOURCE_STATUS_UNSUPPORTED ||
    props.resourceStatus === RESOURCE_STATUS_ERROR
  const readerBlobQuery = useQuery({
    ...readingResourceBlobQueryOptions(props.directory, props.resourcePath),
    enabled: Boolean(props.resourcePath) && resourceSupported && !resourceBlocked,
  })

  if (!props.resourcePath) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {language.t("sidebar.resourcesSelectFile")}
        </div>
      </div>
    )
  }

  if (!resourceSupported) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {language.t("sidebar.resourcesUnsupportedInReader")}
        </div>
      </div>
    )
  }

  if (props.resourceStatus === RESOURCE_STATUS_PREPARING) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex max-w-xl items-center gap-2 rounded-2xl border border-border-info-base/40 bg-surface-info-base/10 px-4 py-3 text-sm text-icon-info-base">
          <Loader2Icon className="size-4 animate-spin" />
          {language.t("sidebar.resourcesPreparing")}
        </div>
      </div>
    )
  }

  if (props.resourceStatus === RESOURCE_STATUS_UNSUPPORTED) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {language.t("sidebar.resourcesUnsupportedInReader")}
        </div>
      </div>
    )
  }

  if (props.resourceStatus === RESOURCE_STATUS_ERROR) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {language.t("sidebar.resourcesError")}
        </div>
      </div>
    )
  }
  const readerSource = useMemo<FoliateReaderSource | null>(() => {
    if (!readerBlobQuery.data) return null
    return {
      kind: "blob",
      blob: readerBlobQuery.data,
      name: props.resourceName,
    }
  }, [props.resourceName, readerBlobQuery.data])

  if (readerBlobQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-weak">
        <Loader2Icon className="size-4 animate-spin" />
        {language.t("projectExplorer.loadingFile")}
      </div>
    )
  }

  if (readerBlobQuery.error) {
    const message =
      readerBlobQuery.error instanceof Error
        ? readerBlobQuery.error.message
        : String(readerBlobQuery.error)
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {message}
        </div>
      </div>
    )
  }

  if (!readerSource) {
    return null
  }

  const persistenceSuffix = props.resourceID
    ? `${NOTEBOOK_PERSISTENCE_SUFFIX_PREFIX}:${props.resourceID}`
    : undefined

  return (
    <FoliateReader
      source={readerSource}
      className="h-full min-h-0"
      persistenceSuffix={persistenceSuffix}
      onLocationChange={props.onLocationChange}
      onChatSelection={props.onChatSelection}
      onChatSelectionRemoved={props.onChatSelectionRemoved}
      onAnnotationsChange={props.onAnnotationsChange}
    />
  )
}
