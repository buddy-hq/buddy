import { createFileRoute, redirect } from "@tanstack/react-router"
import { BenchTargetDeclaration } from "@/components/bench/bench-target-declaration"
import {
  BENCH_CHAT_SEARCH_PARAM,
  BENCH_MODE_REQUEST_POLICY,
  readBenchChatLayoutMode,
  type BenchChatLayoutMode,
} from "@/lib/bench-navigation"
import { selectActiveChatSession } from "@/lib/active-chat-transition-coordinator"
import { decodeDirectory } from "@/lib/directory-token"
import { getLiveDirectoryWorkspace } from "@/lib/directory-workspace-registry"
import { canonicalProjectDirectory } from "@/lib/project-directory"
import { subagentBenchSelection } from "@/lib/subagent-bench-target"
import { openProjectsWithSessionsQueryOptions } from "@/state/bootstrap-query"
import { useChatStore } from "@/state/chat-store"

type SessionBenchSearch = {
  [BENCH_CHAT_SEARCH_PARAM]?: BenchChatLayoutMode
}

const SESSION_BENCH_OWNER_SELECTION_ERROR = "The subagent Bench could not activate its owner chat."
const SESSION_BENCH_PRESENTATION_ERROR = "The subagent Bench could not open its transcript."
export const Route = createFileRoute("/$directory/_bench/sessions/$sessionID")({
  loader: async ({ context, params }) => {
    let directory: string
    try {
      directory = decodeDirectory(params.directory)
    } catch {
      return
    }

    await Promise.allSettled([
      context.queryClient.ensureQueryData(openProjectsWithSessionsQueryOptions()),
    ])

    const chatState = useChatStore.getState()
    const directoryState = chatState.directories[directory]
    const selection = subagentBenchSelection(directoryState?.sessions ?? [], params.sessionID)
    if (!selection) {
      throw redirect({
        to: "/$directory/chat",
        params: { directory: params.directory },
        replace: true,
      })
    }

    const ownerAlreadyActive =
      canonicalProjectDirectory(chatState.activeDirectory) === directory &&
      directoryState?.sessionID === selection.ownerSessionID
    if (ownerAlreadyActive) return

    const transition = await selectActiveChatSession({
      directory,
      sessionID: selection.ownerSessionID,
    })
    if (transition.outcome === "failed") throw transition.error
    if (transition.outcome !== "committed" && transition.outcome !== "noop") {
      throw new Error(SESSION_BENCH_OWNER_SELECTION_ERROR)
    }
    if (
      transition.value.outcome !== "requested" ||
      transition.value.sessionID !== selection.ownerSessionID
    ) {
      throw new Error(SESSION_BENCH_OWNER_SELECTION_ERROR)
    }

    // A same-directory chat transition restores the owner's previous Bench route. Re-present the
    // URL target afterward so direct navigation cannot stop on that older route.
    const workspace = getLiveDirectoryWorkspace(directory)
    if (!workspace) return
    const openResult = await workspace.controller.executeOpen(
      {
        directory,
        target: selection.target,
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      },
      { origin: "user" },
    )
    if (openResult.outcome !== "committed") {
      throw new Error(SESSION_BENCH_PRESENTATION_ERROR)
    }
  },
  validateSearch: (search: Record<string, unknown>): SessionBenchSearch => {
    const chatLayoutMode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM])
    return chatLayoutMode ? { [BENCH_CHAT_SEARCH_PARAM]: chatLayoutMode } : {}
  },
  component: BenchTargetDeclaration,
})
