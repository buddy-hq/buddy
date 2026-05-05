import RENDER_MERMAID_DESCRIPTION from "./render-mermaid.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import z from "zod"
import {
  MERMAID_ARTIFACT_KIND,
  RenderMermaidOutputSchema,
  type MermaidAutoRepairState,
  type RenderMermaidOutput,
} from "../service/v2-types"
import {
  buildMermaidArtifactUrl,
  createToolMermaidArtifact,
  readMermaidRepairRequest,
  readMermaidV2Artifact,
  updateMermaidRepairRequest,
  updateMermaidV2AutoRepairState,
} from "../service/v2-store"

const nonEmptyString = z.string().trim().min(1)

const RenderMermaidInputSchema = z.object({
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  source: nonEmptyString,
  repairOfArtifactID: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
})

type RenderMermaidInput = z.infer<typeof RenderMermaidInputSchema>

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

function nextSucceededAutoRepairState(
  attempts: number,
  replacementArtifactID: string,
): MermaidAutoRepairState {
  return {
    status: "succeeded",
    attempts,
    replacementArtifactID,
  }
}

const renderMermaidTool = createBuddyTool({
  id: "render_mermaid",
  description: RENDER_MERMAID_DESCRIPTION,
  parameters: RenderMermaidInputSchema,
  async execute(params: RenderMermaidInput, ctx: BuddyToolContext) {
    const kind = MERMAID_ARTIFACT_KIND
    await ctx.ask({
      permission: "render_mermaid",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind,
      },
    })

    const parsed = RenderMermaidInputSchema.parse(params)
    const repairOfArtifactID = parsed.repairOfArtifactID
    const previousArtifact = repairOfArtifactID
      ? await readMermaidV2Artifact(ctx.directory, repairOfArtifactID)
      : undefined
    if (previousArtifact && previousArtifact.origin.sessionID !== String(ctx.sessionID)) {
      throw new Error("Mermaid repair target must belong to the current session.")
    }

    const artifact = await createToolMermaidArtifact({
      directory: ctx.directory,
      sessionID: String(ctx.sessionID),
      messageID: String(ctx.messageID),
      callID: createdByCallID(ctx),
      alt: parsed.alt,
      ...(parsed.caption ? { caption: parsed.caption } : {}),
      source: parsed.source,
      ...(repairOfArtifactID ? { supersedesArtifactID: repairOfArtifactID } : {}),
    })

    if (previousArtifact) {
      if (
        previousArtifact.autoRepair.status === "running" &&
        previousArtifact.autoRepair.repairRequestID.trim().length > 0
      ) {
        const request = await readMermaidRepairRequest(
          ctx.directory,
          previousArtifact.autoRepair.repairRequestID,
        )
        await updateMermaidRepairRequest(ctx.directory, request.repairRequestID, {
          status: "succeeded",
          replacementArtifactID: artifact.artifactID,
        })
      }
      await updateMermaidV2AutoRepairState(
        ctx.directory,
        previousArtifact.artifactID,
        nextSucceededAutoRepairState(previousArtifact.autoRepair.attempts, artifact.artifactID),
      )
    }

    const output: RenderMermaidOutput = RenderMermaidOutputSchema.parse({
      artifactID: artifact.artifactID,
      kind,
      mime: "application/vnd.buddy.mermaid",
      alt: artifact.alt,
      ...(artifact.caption ? { caption: artifact.caption } : {}),
      diagramType: artifact.diagramType,
      source: artifact.source,
      sourceHash: artifact.sourceHash,
      preflightRepairs: artifact.preflightRepairs,
      artifactUrl: buildMermaidArtifactUrl(ctx.directory, artifact.artifactID),
      ...(artifact.supersedesArtifactID
        ? { supersedesArtifactID: artifact.supersedesArtifactID }
        : {}),
    })

    return {
      title: "Mermaid diagram queued",
      output: "Mermaid diagram artifact created and queued for browser rendering.",
      metadata: {
        artifact: "RenderMermaidOutput",
        value: output,
      },
    }
  },
})

export { renderMermaidTool }
