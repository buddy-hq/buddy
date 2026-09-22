import { useEffect, useMemo, useState, type ReactNode } from "react"
import { DocumentReader } from "@/components/readers/document-reader"
import { READER_FORMAT_PDF, type ReaderSource } from "@/components/readers/reader-types"
import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
  resolveServerEndpoint,
} from "@/lib/server-client"

type ToolAttachmentPdfPreviewProps = {
  attachmentID: string
  sourceUrl: string
  name: string
  fallback: ReactNode
}

function requestToolAttachment(sourceUrl: string): Promise<Response> {
  if (sourceUrl.startsWith("data:") || sourceUrl.startsWith("blob:")) return fetch(sourceUrl)
  const apiBaseUrl = resolveServerApiBaseUrl()
  const target = new URL(resolveServerEndpoint(sourceUrl), apiBaseUrl)
  if (target.origin !== new URL(apiBaseUrl).origin) return fetch(target)
  const authorization = authorizationHeader()
  return createServerFetchTransport(apiBaseUrl)(
    target,
    authorization ? { headers: { authorization } } : undefined,
  )
}

export async function loadToolAttachmentBlob(sourceUrl: string): Promise<Blob> {
  const response = await requestToolAttachment(sourceUrl)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.blob()
}

export function ToolAttachmentPdfPreview(props: ToolAttachmentPdfPreviewProps) {
  const [blob, setBlob] = useState<Blob>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void loadToolAttachmentBlob(props.sourceUrl).then(
      (next) => {
        if (!cancelled) setBlob(next)
      },
      (cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      },
    )
    return () => {
      cancelled = true
    }
  }, [props.sourceUrl])

  const source = useMemo<ReaderSource | null>(
    () =>
      blob
        ? {
            kind: "blob",
            blob,
            name: props.name,
            sourceId: props.attachmentID,
            format: READER_FORMAT_PDF,
          }
        : null,
    [blob, props.attachmentID, props.name],
  )

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 p-6 text-sm text-text-weak">
        <p>{`Buddy couldn't preview this PDF. ${error}`}</p>
        {props.fallback}
      </div>
    )
  }
  return <DocumentReader source={source} className="h-full min-h-0" />
}
