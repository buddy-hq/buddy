import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  BenchReadContextInputSchema,
  BenchReadContextOutputSchema,
  readCurrentBenchContext,
} from "../context"
import { benchClientActionBroker } from "../client-actions"
import { writeTemporaryBenchCapture } from "../captures"
import { BENCH_READ_CONTEXT_TAB_LIMIT, projectModelVisibleBenchTabs } from "../model-tabs"

type VisibleBenchContext = Extract<
  ReturnType<typeof readCurrentBenchContext>,
  { status: "open"; visibility: "visible" }
>

type CapturedBench = {
  temporaryBenchScreenshotPath: string
  context: VisibleBenchContext
}

type OpenBenchContext = Extract<ReturnType<typeof readCurrentBenchContext>, { status: "open" }>

type TJsonValue = string | number | boolean | null | TJsonValue[] | TJsonObject
type TJsonObject = { [key: string]: TJsonValue }
type TToolExecuteResult = {
  title: string
  output: string
  metadata: TJsonObject
}

function projectModelVisibleBenchContext(input: {
  context: OpenBenchContext
  directory: string
  tabSearch?: string
}) {
  const { context } = input
  const projectedTabs = projectModelVisibleBenchTabs(
    Object.assign(
      {
        directory: input.directory,
        tabs: context.tabs,
        selectedTabKey: context.selectedTabKey,
        limit: BENCH_READ_CONTEXT_TAB_LIMIT,
      },
      context.visibility === "visible" ? { selectedTabTitle: context.target.title } : undefined,
      input.tabSearch ? { tabSearch: input.tabSearch } : undefined,
    ),
  )
  const tabContext = Object.assign(
    {
      openTabCount: projectedTabs.openTabCount,
      tabs: projectedTabs.tabs,
    },
    input.tabSearch ? { matchingTabCount: projectedTabs.matchingTabCount } : undefined,
    projectedTabs.omittedTabCount > 0
      ? { omittedTabCount: projectedTabs.omittedTabCount }
      : undefined,
  )
  if (context.visibility === "parked") {
    return {
      status: context.status,
      visibility: context.visibility,
      ...tabContext,
    }
  }
  return Object.assign(
    Object.assign(
      Object.assign(
        {
          status: context.status,
          visibility: context.visibility,
        },
        context.target.status === "ready" ? undefined : { surfaceStatus: context.target.status },
        context.drawer ? { drawer: context.drawer } : undefined,
        context.metadata.length > 0 ? { metadata: context.metadata } : undefined,
      ),
      context.content ? { content: context.content } : undefined,
      context.refs.length > 0 ? { refs: context.refs } : undefined,
      context.hints.length > 0 ? { hints: context.hints } : undefined,
    ),
    tabContext,
  )
}

async function captureCurrentBench(input: {
  directory: string
  sessionID: string
  messageID: string
  callID: string | null
  abort: AbortSignal
  context: VisibleBenchContext
}): Promise<CapturedBench> {
  const selectedTab = input.context.tabs.find((tab) => tab.tabKey === input.context.selectedTabKey)
  if (!selectedTab) {
    throw new Error("Bench tab context is stale. Call bench_read_context again before capturing.")
  }
  const enqueued = benchClientActionBroker.enqueueRequiredAction({
    directory: input.directory,
    sessionID: input.sessionID,
    messageID: input.messageID,
    callID: input.callID,
    command: {
      type: "capture_bench_screenshot",
      tabKey: selectedTab.tabKey,
      target: selectedTab.target,
      drawer: input.context.drawer?.kind ?? null,
    },
  })
  const cancel = () => {
    benchClientActionBroker.cancelAction({
      directory: input.directory,
      actionID: enqueued.action.actionID,
    })
  }
  input.abort.addEventListener("abort", cancel, { once: true })
  try {
    const terminal = await enqueued.completion
    input.abort.throwIfAborted()
    if (terminal.status === "cancelled") {
      throw new Error("Bench screenshot capture was superseded. Read Bench again before retrying.")
    }
    if (terminal.status === "expired") {
      throw new Error(
        terminal.delivered
          ? "Bench screenshot capture timed out. Use responseFormat context_only or retry after Bench settles."
          : "No active Bench client is available to capture a screenshot.",
      )
    }
    const completion = terminal.completion
    if (completion.outcome !== "captured") {
      if (completion.outcome === "committed") {
        throw new Error("Bench returned the wrong acknowledgement for screenshot capture.")
      }
      const reason = completion.reason
      if (reason === "capture_unavailable") {
        throw new Error("This Bench client cannot capture screenshots.")
      }
      throw new Error(`Bench screenshot capture failed: ${reason}.`)
    }
    return {
      temporaryBenchScreenshotPath: await writeTemporaryBenchCapture({
        sessionID: input.sessionID,
        messageID: input.messageID,
        pngBase64: completion.pngBase64,
      }),
      context: completion.context,
    }
  } finally {
    input.abort.removeEventListener("abort", cancel)
  }
}

const benchReadContextTool = createBuddyTool({
  id: "bench_read_context",
  description:
    "Read a compact model-visible summary of the current Bench surface and a bounded open-tab listing with one-based tab numbers and exact tab keys. The selected tab is marked selected and includes the minimal target needed for follow-up tools; other tabs include only number, key, and title. Use responseFormat context_only for ordinary reads, context_and_bench_screenshot for context plus a temporary PNG path and capture receipt, or bench_screenshot_only for only the path and receipt. Omit tabSearch for the selected and recently opened tabs, or provide text such as 'tab 3' to search every internally stored open tab before Buddy returns bounded matches. Reading and searching never change the selected tab, reveal parked Bench, or dismiss a drawer.",
  parameters: BenchReadContextInputSchema,
  presentation: {
    archetype: "activity",
    icon: "read",
    renderer: "buddy-custom",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading Bench" },
      running: { action: "Reading Bench" },
      completed: { action: "Read Bench" },
      error: { action: "Failed to read Bench" },
    },
    summary: {
      category: "read-bench",
      pending: "Reading Bench",
      running: "Reading Bench",
      completed: "Read Bench",
      error: "Failed to read Bench",
    },
  },
  async execute(params, ctx): Promise<TToolExecuteResult> {
    const result = BenchReadContextOutputSchema.parse(
      readCurrentBenchContext({
        directory: ctx.directory,
        sessionID: String(ctx.sessionID),
      }),
    )

    if (params.responseFormat !== "context_only") {
      if (result.status === "closed") {
        throw new Error("Bench is closed, so there is no visible Bench surface to capture.")
      }
      if (result.visibility === "parked") {
        throw new Error(
          "Bench is parked, so there is no visible Bench surface to capture. Use responseFormat context_only or ask the user to reveal Bench.",
        )
      }
      const capturedBench = await captureCurrentBench({
        directory: ctx.directory,
        sessionID: String(ctx.sessionID),
        messageID: String(ctx.messageID),
        callID: ctx.callID ? String(ctx.callID) : null,
        abort: ctx.abort,
        context: result,
      })
      const synchronizedContext = capturedBench.context
      const screenshot = {
        temporaryBenchScreenshotPath: capturedBench.temporaryBenchScreenshotPath,
        capture: {
          capturedAt: new Date().toISOString(),
          targetKey: synchronizedContext.targetKey,
          title: synchronizedContext.target.title,
          drawer: synchronizedContext.drawer?.kind ?? null,
        },
      }
      const output =
        params.responseFormat === "bench_screenshot_only"
          ? screenshot
          : {
              ...projectModelVisibleBenchContext(
                Object.assign(
                  {
                    context: synchronizedContext,
                    directory: ctx.directory,
                  },
                  params.tabSearch ? { tabSearch: params.tabSearch } : undefined,
                ),
              ),
              ...screenshot,
            }
      return {
        title: "Read Bench",
        output: JSON.stringify(output, null, 2),
        metadata: {
          benchStatus: "open",
          benchVisibility: synchronizedContext.visibility,
          benchTargetKey: synchronizedContext.targetKey,
          drawer: synchronizedContext.drawer?.kind ?? null,
          targetType: synchronizedContext.target.type,
          surfaceStatus: synchronizedContext.target.status,
          capturedBenchScreenshot: true,
        },
      }
    }

    if (result.status === "closed") {
      return {
        title: "Read Bench",
        output: JSON.stringify(result),
        metadata: {
          benchStatus: "closed",
        },
      }
    }

    if (result.visibility === "parked") {
      return {
        title: "Read Bench",
        output: JSON.stringify(
          projectModelVisibleBenchContext(
            Object.assign(
              {
                context: result,
                directory: ctx.directory,
              },
              params.tabSearch ? { tabSearch: params.tabSearch } : undefined,
            ),
          ),
          null,
          2,
        ),
        metadata: {
          benchStatus: "open",
          benchVisibility: result.visibility,
          selectedTabKey: result.selectedTabKey,
        },
      }
    }

    return {
      title: "Read Bench",
      output: JSON.stringify(
        projectModelVisibleBenchContext(
          Object.assign(
            {
              context: result,
              directory: ctx.directory,
            },
            params.tabSearch ? { tabSearch: params.tabSearch } : undefined,
          ),
        ),
        null,
        2,
      ),
      metadata: {
        benchStatus: "open",
        benchVisibility: result.visibility,
        benchTargetKey: result.targetKey,
        drawer: result.drawer?.kind ?? null,
        targetType: result.target.type,
        surfaceStatus: result.target.status,
      },
    }
  },
})

export { benchReadContextTool }
