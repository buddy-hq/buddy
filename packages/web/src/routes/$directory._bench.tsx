import { Outlet, createFileRoute } from "@tanstack/react-router"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  readBenchChatLayoutMode,
  type BenchChatLayoutMode,
} from "@/lib/bench-navigation"

type BenchRouteSearch = {
  [BENCH_CHAT_SEARCH_PARAM]?: BenchChatLayoutMode
}

type TIncomingSearchValue = string | number | boolean
type TIncomingSearch = {
  readonly [key: string]: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined
}

export const Route = createFileRoute("/$directory/_bench")({
  validateSearch: (search: TIncomingSearch): BenchRouteSearch => {
    const chatLayoutMode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM])
    return chatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING
      ? { [BENCH_CHAT_SEARCH_PARAM]: chatLayoutMode }
      : {}
  },
  component: BenchRouteOutlet,
})

function BenchRouteOutlet() {
  return <Outlet />
}
