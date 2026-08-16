import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
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

type TIncomingSearchValue = string | number | boolean
type TIncomingSearch = {
  readonly [key: string]: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined
}

function parseTSearchString<T>(value: T): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success && parsed.data.length > 0 ? parsed.data : undefined
}

export const Route = createFileRoute("/$directory/_bench/objects/$kind/$objectID")({
  validateSearch: (search: TIncomingSearch): ObjectBenchSearch => {
    const chatLayoutMode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM])
    const view = parseTSearchString(search.view)
    const revision = parseTSearchString(search.revision)
    const item = parseTSearchString(search.item)
    return Object.assign(
      {},
      view ? { view } : undefined,
      revision ? { revision } : undefined,
      item ? { item } : undefined,
      chatLayoutMode ? { [BENCH_CHAT_SEARCH_PARAM]: chatLayoutMode } : undefined,
    )
  },
  component: BenchTargetDeclaration,
})
