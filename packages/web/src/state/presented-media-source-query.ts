import { queryOptions } from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { readPresentedMediaSourceBlob } from "@/lib/presented-media-source"

const PRESENTED_MEDIA_SOURCE_QUERY_SCOPE = "presented-media-source" as const

type PresentedMediaSourceQueryInput = {
  directory: string
  objectID: string
  itemID: string
  fileName: string
  modifiedAt: string | null
}

export async function loadPresentedMediaSource(
  input: PresentedMediaSourceQueryInput,
): Promise<string> {
  const blob = requireBuddyData(
    await getBuddyClient(input.directory).objectMediaPresentation.raw({
      directory: input.directory,
      objectID: input.objectID,
      itemID: input.itemID,
      fileName: input.fileName,
    }),
  )
  return readPresentedMediaSourceBlob(blob)
}

export function presentedMediaSourceQueryOptions(input: PresentedMediaSourceQueryInput) {
  return queryOptions({
    queryKey: [PRESENTED_MEDIA_SOURCE_QUERY_SCOPE, input] as const,
    queryFn: () => loadPresentedMediaSource(input),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
