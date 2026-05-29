import RENDER_MERMAID_DESCRIPTION from "./render-mermaid.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import z from "zod"
import {
  MERMAID_ARTIFACT_KIND,
  MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX,
  RenderMermaidOutputSchema,
  type MermaidArtifactReadResult,
  type MermaidAutoRepairState,
  type RenderMermaidOutput,
} from "../service/v2-types"
import { MermaidArtifactNotFoundError } from "../errors"
import {
  buildMermaidArtifactUrl,
  createToolMermaidArtifact,
  readMermaidRepairRequest,
  readMermaidV2Artifact,
  updateMermaidRepairRequest,
  updateMermaidV2AutoRepairState,
} from "../service/v2-store"
import { MermaidArtifactPathV2 } from "../service/v2-path"

const nonEmptyString = z.string().trim().min(1)

const RenderMermaidInputSchema = z.object({
  alt: nonEmptyString.describe("Short, learner-facing alt text for the diagram."),
  caption: nonEmptyString
    .optional()
    .describe("Optional concise caption. Omit unless a visible caption helps the learner."),
  source: nonEmptyString.describe(
    "Mermaid source to render as a fresh diagram or repaired diagram.",
  ),
  repairOfArtifactID: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional()
    .describe(
      "Optional repair target. Only pass this when repairing or superseding an existing Mermaid artifact ID copied verbatim from a prior failed diagram or repair prompt. Omit for every new diagram. Never invent IDs, use placeholders, or use repeated-character sample IDs.",
    ),
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

function isAutoRepairMessage(messageID: unknown): boolean {
  return String(messageID).startsWith(MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX)
}

function isAutoRepairTurn(messages: BuddyToolContext["messages"]): boolean {
  return isAutoRepairMessage(messages.findLast((message) => message.info.role === "user")?.info.id)
}

async function resolveRepairTarget(input: {
  directory: string
  isAutoRepair: boolean
  repairOfArtifactID?: string
}): Promise<{
  previousArtifact?: MermaidArtifactReadResult
  ignoredRepairOfArtifactID?: string
}> {
  if (!input.repairOfArtifactID) {
    return {}
  }

  try {
    return {
      previousArtifact: await readMermaidV2Artifact(input.directory, input.repairOfArtifactID),
    }
  } catch (error) {
    if (!(error instanceof MermaidArtifactNotFoundError)) {
      throw error
    }
    if (input.isAutoRepair) {
      throw new Error(
        `Mermaid repair target '${input.repairOfArtifactID}' was not found. Use the exact artifact ID from the repair prompt; omit repairOfArtifactID for a fresh diagram.`,
        { cause: error },
      )
    }
    return {
      ignoredRepairOfArtifactID: input.repairOfArtifactID,
    }
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
    const { previousArtifact, ignoredRepairOfArtifactID } = await resolveRepairTarget({
      directory: ctx.directory,
      isAutoRepair: isAutoRepairTurn(ctx.messages),
      ...(repairOfArtifactID ? { repairOfArtifactID } : {}),
    })
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
      ...(previousArtifact ? { supersedesArtifactID: previousArtifact.artifactID } : {}),
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
      filesystemPath: MermaidArtifactPathV2.artifactDirectory(ctx.directory, artifact.artifactID),
      ...(artifact.supersedesArtifactID
        ? { supersedesArtifactID: artifact.supersedesArtifactID }
        : {}),
    })

    return {
      title: "Mermaid diagram queued",
      output: [
        "Mermaid diagram artifact created and queued for browser rendering.",
        ...(ignoredRepairOfArtifactID
          ? [
              "",
              `Ignored repairOfArtifactID "${ignoredRepairOfArtifactID}" because no existing Mermaid artifact with that ID was found. Omit repairOfArtifactID for new diagrams; only pass an ID copied from a prior failed Mermaid artifact when repairing it.`,
            ]
          : []),
      ].join("\n"),
      metadata: {
        artifact: "RenderMermaidOutput",
        value: output,
      },
    }
  },
})

export { renderMermaidTool }
