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

export const Route = createFileRoute("/$directory/_bench")({
  validateSearch: (search: Record<string, unknown>): BenchRouteSearch => {
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
