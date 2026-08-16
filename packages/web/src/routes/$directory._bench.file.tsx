import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { BenchTargetDeclaration } from "@/components/bench/bench-target-declaration"

type ProjectFileBenchSearch = {
  fragment?: string
  path?: string
}

type TIncomingSearchValue = string | number | boolean
type TIncomingSearch = {
  readonly [key: string]: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined
}

function parseTSearchString<T>(value: T): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/**
 * Bench routes declare the active target through the URL only. The surface itself is rendered by
 * BenchSurfaceHost from the workspace projection, so a surface belonging to another chat can stay
 * mounted while this route is the active match.
 */
export const Route = createFileRoute("/$directory/_bench/file")({
  validateSearch: (search: TIncomingSearch): ProjectFileBenchSearch => ({
    fragment: parseTSearchString(search.fragment),
    path: parseTSearchString(search.path),
  }),
  component: BenchTargetDeclaration,
})
