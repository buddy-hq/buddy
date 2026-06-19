import { useQuery } from "@tanstack/react-query"
import { objectViewQueryOptions } from "@/state/workspace-objects-query"
import {
  readInlineData,
  type BuddyPresentationDescriptor,
} from "./buddy-object-result"

type HydratedInlinePresentation = {
  presentation: BuddyPresentationDescriptor
  isPending: boolean
  error: Error | null
}

export function useHydratedInlinePresentation(input: {
  directory: string | undefined
  presentation: BuddyPresentationDescriptor
  alwaysHydrate?: boolean
}): HydratedInlinePresentation {
  const shouldHydrate =
    Boolean(input.directory) && (input.alwaysHydrate === true || input.presentation.data === null)
  const query = useQuery({
    ...objectViewQueryOptions({
      directory: input.directory ?? "",
      kind: input.presentation.ref.kind,
      objectID: input.presentation.ref.objectID,
      viewID: input.presentation.viewID,
      ...(input.presentation.ref.revisionID
        ? { revisionID: input.presentation.ref.revisionID }
        : {}),
      ...(input.presentation.ref.itemID ? { itemID: input.presentation.ref.itemID } : {}),
    }),
    enabled: shouldHydrate,
  })
  const hydratedData = query.data ? readInlineData(query.data.data) : undefined

  return {
    presentation: hydratedData
      ? { ...input.presentation, data: hydratedData }
      : input.presentation,
    isPending: shouldHydrate && query.isPending && input.presentation.data === null,
    error: query.error,
  }
}
