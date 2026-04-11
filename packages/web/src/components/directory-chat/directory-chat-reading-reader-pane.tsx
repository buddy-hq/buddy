import { useEffect, useMemo, useState } from "react"
import { Loader2Icon } from "lucide-react"
import {
  FoliateReader,
  type FoliateReaderLocation,
  type FoliateReaderSource,
} from "@/components/readers/foliate-reader"
import { language } from "@/context/language"
import { apiFetch } from "@/lib/api-client"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"

type DirectoryChatReadingReaderPaneProps = {
  directory: string
  resourceName: string
  resourcePath: string
  onLocationChange?: (location: FoliateReaderLocation) => void
}

const READING_RESOURCE_EXTENSIONS = new Set(["pdf", "epub"])

function isSupportedReadingResource(path: string) {
  return READING_RESOURCE_EXTENSIONS.has(fileExtensionFromPath(path))
}

export function DirectoryChatReadingReaderPane(props: DirectoryChatReadingReaderPaneProps) {
  const [readerBlob, setReaderBlob] = useState<Blob | undefined>(undefined)
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerError, setReaderError] = useState<string | undefined>(undefined)

  useEffect(() => {
    setReaderBlob(undefined)
    setReaderError(undefined)
    if (!props.resourcePath) {
      setReaderError(language.t("sidebar.resourcesSelectFile"))
      return
    }
    if (!isSupportedReadingResource(props.resourcePath)) {
      setReaderError(language.t("sidebar.resourcesUnsupportedInReader"))
      return
    }

    let cancelled = false
    const request = buildProjectFileRawUrl(props.directory, props.resourcePath)

    const loadReaderBlob = async () => {
      setReaderLoading(true)
      setReaderError(undefined)
      try {
        const response = await apiFetch(request.endpoint, {
          directory: request.directory,
        })
        if (!response.ok) {
          const message = await response.text().catch(() => "")
          throw new Error(message.trim() || `Request failed (${response.status})`)
        }
        const nextBlob = await response.blob()
        if (!cancelled) {
          setReaderBlob(nextBlob)
        }
      } catch (error) {
        if (cancelled) return
        setReaderError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) {
          setReaderLoading(false)
        }
      }
    }

    void loadReaderBlob()
    return () => {
      cancelled = true
    }
  }, [props.directory, props.resourcePath])

  const readerSource = useMemo<FoliateReaderSource | null>(() => {
    if (!readerBlob) return null
    return {
      kind: "blob",
      blob: readerBlob,
      name: props.resourceName,
    }
  }, [props.resourceName, readerBlob])

  if (readerLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-weak">
        <Loader2Icon className="size-4 animate-spin" />
        {language.t("projectExplorer.loadingFile")}
      </div>
    )
  }

  if (readerError) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {readerError}
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
