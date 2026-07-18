import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  BenchReadContextInputSchema,
  BenchReadContextOutputSchema,
  readCurrentBenchContext,
} from "../context"

const benchReadContextTool = createBuddyTool({
  id: "bench_read_context",
  description:
    "Read the current model-visible Bench context. Returns status closed when Bench is closed; otherwise returns the loaded Bench target, drawer state, machine refs, metadata, and a model-readable context dump. If Explorer or Library is open as a drawer, the target remains loaded on Bench while that drawer is over it.",
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
  async execute(_params, ctx) {
    const result = BenchReadContextOutputSchema.parse(
      readCurrentBenchContext({
        directory: ctx.directory,
        sessionID: String(ctx.sessionID),
      }),
    )

    if (result.status === "closed") {
      return {
        title: "Read Bench",
        output: JSON.stringify(result),
        metadata: {
          benchStatus: "closed",
        },
      }
    }

    return {
      title: "Read Bench",
      output: JSON.stringify(result, null, 2),
      metadata: {
        benchStatus: "open",
        benchTargetKey: result.targetKey,
        drawer: result.drawer?.kind ?? null,
        targetType: result.target.type,
        surfaceStatus: result.target.status,
      },
    }
  },
})

export { benchReadContextTool }
