import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import {
  BenchReadContextInputSchema,
  BenchReadContextOutputSchema,
  benchTargetFromContextTarget,
  readCurrentBenchContext,
} from "../context"

const benchReadContextTool = createBuddyTool({
  id: "bench_read_context",
  description:
    "Read what the learner is currently seeing on Bench. Returns status closed when Bench is closed; otherwise returns the active target, machine refs, metadata, and a model-readable context dump.",
  parameters: BenchReadContextInputSchema,
  ui: {
    presentation: "hidden-summary",
    labels: {
      running: "Reading Bench",
      idle: "Read Bench",
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
        benchTarget: benchTargetFromContextTarget(result.target),
        targetType: result.target.type,
        surfaceStatus: result.target.status,
      },
    }
  },
})

export { benchReadContextTool }
