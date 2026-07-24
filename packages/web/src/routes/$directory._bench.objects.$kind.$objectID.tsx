import { createFileRoute } from "@tanstack/react-router"
import { BenchTargetDeclaration } from "@/components/bench/bench-target-declaration"
import {
  BENCH_CHAT_SEARCH_PARAM,
  readBenchChatLayoutMode,
  type BenchChatLayoutMode,
} from "@/lib/bench-navigation"

type ObjectBenchSearch = {
  view?: string
  revision?: string
  item?: string
  [BENCH_CHAT_SEARCH_PARAM]?: BenchChatLayoutMode
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export const Route = createFileRoute("/$directory/_bench/objects/$kind/$objectID")({
  validateSearch: (search: Record<string, unknown>): ObjectBenchSearch => {
    const chatLayoutMode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM])
    return {
      ...(readString(search.view) ? { view: readString(search.view) } : {}),
      ...(readString(search.revision) ? { revision: readString(search.revision) } : {}),
      ...(readString(search.item) ? { item: readString(search.item) } : {}),
      ...(chatLayoutMode ? { [BENCH_CHAT_SEARCH_PARAM]: chatLayoutMode } : {}),
    }
  },
  component: BenchTargetDeclaration,
})
