import { useQuery } from "@tanstack/react-query"
import { objectViewQueryOptions } from "@/state/workspace-objects-query"
import { readInlineData, type BuddyPresentationDescriptor } from "./buddy-object-result"

type THydratedInlinePresentation = {
  presentation: BuddyPresentationDescriptor
  isPending: boolean
  error: Error | null
}

type TObjectViewQueryInput = {
  directory: string
  kind: BuddyPresentationDescriptor["ref"]["kind"]
  objectID: string
  viewID: string
  revisionID?: string
  itemID?: string
}

export function useHydratedInlinePresentation(input: {
  directory: string | undefined
  presentation: BuddyPresentationDescriptor
  alwaysHydrate?: boolean
}): THydratedInlinePresentation {
  const shouldHydrate =
    Boolean(input.directory) && (input.alwaysHydrate === true || input.presentation.data === null)
  const revisionID = input.presentation.ref.revisionID
  const itemID = input.presentation.ref.itemID
  const queryInput: TObjectViewQueryInput = Object.assign(
    {
      directory: input.directory ?? "",
      kind: input.presentation.ref.kind,
      objectID: input.presentation.ref.objectID,
      viewID: input.presentation.viewID,
    },
    revisionID ? { revisionID } : undefined,
    itemID ? { itemID } : undefined,
  )
  const query = useQuery({
    ...objectViewQueryOptions(queryInput),
    enabled: shouldHydrate,
  })
  const hydratedData = query.data ? readInlineData(query.data.data) : undefined

  return {
    presentation: hydratedData ? { ...input.presentation, data: hydratedData } : input.presentation,
    isPending: shouldHydrate && query.isPending && input.presentation.data === null,
    error: query.error,
  }
}
