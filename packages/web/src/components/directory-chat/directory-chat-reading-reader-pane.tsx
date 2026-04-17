import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import {
  FoliateReader,
  type FoliateReaderLocation,
  type FoliateReaderSource,
} from "@/components/readers/foliate-reader"
import { language } from "@/context/language"
import {
  isSupportedReadingResourcePath,
  readingResourceBlobQueryOptions,
} from "@/state/resources-query"

type DirectoryChatReadingReaderPaneProps = {
  directory: string
  resourceName: string
  resourcePath: string
  onLocationChange?: (location: FoliateReaderLocation) => void
}

export function DirectoryChatReadingReaderPane(props: DirectoryChatReadingReaderPaneProps) {
  const resourceSupported = isSupportedReadingResourcePath(props.resourcePath)
  const readerBlobQuery = useQuery({
    ...readingResourceBlobQueryOptions(props.directory, props.resourcePath),
    enabled: Boolean(props.resourcePath) && resourceSupported,
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

  return (
    <FoliateReader
      source={readerSource}
      className="h-full min-h-0"
      onLocationChange={props.onLocationChange}
    />
  )
}
