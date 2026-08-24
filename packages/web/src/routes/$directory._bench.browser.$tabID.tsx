import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { BenchTargetDeclaration } from "@/components/bench/bench-target-declaration"
import {
  BENCH_CHAT_SEARCH_PARAM,
  readBenchChatLayoutMode,
  type BenchChatLayoutMode,
} from "@/lib/bench-navigation"

type BrowserBenchSearch = {
  url?: string
  [BENCH_CHAT_SEARCH_PARAM]?: BenchChatLayoutMode
}

type TIncomingSearchValue = string | number | boolean
type TIncomingSearch = {
  readonly [key: string]: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined
}

function parseTSearchString<TValue>(value: TValue): string | undefined {
  const parsed = z.string().trim().min(1).safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const Route = createFileRoute("/$directory/_bench/browser/$tabID")({
  validateSearch: (search: TIncomingSearch): BrowserBenchSearch => {
    const chatLayoutMode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM])
    const url = parseTSearchString(search.url)
    return Object.assign(
      {},
      url ? { url } : undefined,
      chatLayoutMode ? { [BENCH_CHAT_SEARCH_PARAM]: chatLayoutMode } : undefined,
    )
  },
  component: BenchTargetDeclaration,
})
