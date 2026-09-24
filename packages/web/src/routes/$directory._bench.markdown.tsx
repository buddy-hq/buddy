import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { BenchTargetDeclaration } from "@/components/bench/bench-target-declaration"

type MarkdownBenchSearch = {
  fragment?: string
  id?: string
  path?: string
  root?: "notebook" | "notes"
}

type TIncomingSearchValue = string | number | boolean
type TIncomingSearch = {
  readonly [key: string]: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined
}

function parseTSearchString<T>(value: T): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const Route = createFileRoute("/$directory/_bench/markdown")({
  validateSearch: (search: TIncomingSearch): MarkdownBenchSearch => ({
    fragment: parseTSearchString(search.fragment),
    id: parseTSearchString(search.id),
    path: parseTSearchString(search.path),
    root: search.root === "notebook" || search.root === "notes" ? search.root : undefined,
  }),
  component: BenchTargetDeclaration,
})
