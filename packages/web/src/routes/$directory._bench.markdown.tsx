import { createFileRoute } from "@tanstack/react-router"
import { BenchTargetDeclaration } from "@/components/bench/bench-target-declaration"

type MarkdownBenchSearch = {
  fragment?: string
  path?: string
}

export const Route = createFileRoute("/$directory/_bench/markdown")({
  validateSearch: (search: Record<string, unknown>): MarkdownBenchSearch => ({
    fragment: typeof search.fragment === "string" ? search.fragment : undefined,
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  component: BenchTargetDeclaration,
})
