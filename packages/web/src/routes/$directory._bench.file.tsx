import { createFileRoute } from "@tanstack/react-router"
import { BenchTargetDeclaration } from "@/components/bench/bench-target-declaration"

type ProjectFileBenchSearch = {
  fragment?: string
  path?: string
}

/**
 * Bench routes declare the active target through the URL only. The surface itself is rendered by
 * BenchSurfaceHost from the workspace projection, so a surface belonging to another chat can stay
 * mounted while this route is the active match.
 */
export const Route = createFileRoute("/$directory/_bench/file")({
  validateSearch: (search: Record<string, unknown>): ProjectFileBenchSearch => ({
    fragment: typeof search.fragment === "string" ? search.fragment : undefined,
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  component: BenchTargetDeclaration,
})
