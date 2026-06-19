import RENDER_MERMAID_DESCRIPTION from "./render-mermaid.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  nonEmptyString,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import { MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX } from "../service/types"
import {
  createToolMermaidObject,
  readMermaidRepairRequest,
  readMermaidObjectManifest,
} from "../service/store"

const RenderMermaidInputSchema = z.object({
  alt: nonEmptyString.describe("Short, learner-facing alt text for the diagram."),
  caption: nonEmptyString
    .optional()
    .describe("Optional concise caption. Omit unless a visible caption helps the learner."),
  source: nonEmptyString.describe(
    "Mermaid source to render as a fresh diagram or repaired diagram.",
  ),
  repairOfObjectID: BuddyObjectIDSchema
    .optional()
    .describe(
      "Optional repair target. Only pass this when repairing or superseding an existing Mermaid object ID copied verbatim from a prior failed diagram or repair prompt. Omit for every new diagram. Never invent IDs, use placeholders, or use repeated-character sample IDs.",
    ),
})

type RenderMermaidInput = z.infer<typeof RenderMermaidInputSchema>

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

function isAutoRepairMessage(messageID: unknown): boolean {
  return String(messageID).startsWith(MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX)
}

function readCurrentMessage(input: {
  messages: BuddyToolContext["messages"]
  currentMessageID: BuddyToolContext["messageID"]
}): BuddyToolContext["messages"][number] | undefined {
  const currentMessageID = String(input.currentMessageID)
  return input.messages.find((message) => String(message.info.id) === currentMessageID)
}

function readAutoRepairRequestID(input: {
  messages: BuddyToolContext["messages"]
  currentMessageID: BuddyToolContext["messageID"]
}): string | undefined {
  const currentMessageID = String(input.currentMessageID)
  if (isAutoRepairMessage(currentMessageID)) {
    return currentMessageID
  }

  const currentMessage = readCurrentMessage(input)
  if (
    currentMessage?.info.role === "assistant" &&
    isAutoRepairMessage(currentMessage.info.parentID)
  ) {
    return String(currentMessage.info.parentID)
  }

  return undefined
}

function isAutoRepairTurn(input: {
  messages: BuddyToolContext["messages"]
  currentMessageID: BuddyToolContext["messageID"]
}): boolean {
  return readAutoRepairRequestID(input) !== undefined
}

async function resolveRepairTarget(input: {
  directory: string
  isAutoRepair: boolean
  repairOfObjectID?: string
}): Promise<{
  previousObjectID?: string
  ignoredRepairOfObjectID?: string
}> {
  if (!input.repairOfObjectID) {
    return {}
  }

  try {
    const manifest = await readMermaidObjectManifest(input.directory, input.repairOfObjectID)
    return { previousObjectID: manifest.objectID }
  } catch (error) {
    if (input.isAutoRepair) {
      throw new Error(
        `Mermaid repair target '${input.repairOfObjectID}' was not found. Use the exact object ID from the repair prompt; omit repairOfObjectID for a fresh diagram.`,
        { cause: error },
      )
    }
    return {
      ignoredRepairOfObjectID: input.repairOfObjectID,
    }
  }
}

function buildRenderMermaidObjectResult(input: {
  objectID: string
  revisionID: string
  title: string
  alt: string
  caption: string | null
  source: string
  renderStatus: "ready" | "stale" | "error"
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.mermaid,
    objectID: input.objectID,
    revisionID: input.revisionID,
    itemID: null,
  }
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: "Mermaid diagram object created and queued for browser rendering.",
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.mermaid,
        objectID: input.objectID,
        title: input.title,
        status: "ready",
        lifecycle: "revisioned",
        sourceRoot: null,
      }),
    ],
    presentations: [
      {
        ref,
        viewID: "rendered",
        surface: "inline",
        data: {
          renderer: "mermaid",
          source: input.source,
          svgUrl: null,
          alt: input.alt,
          caption: input.caption,
          renderStatus: input.renderStatus,
          failedRenderKey: null,
        },
        autoOpen: null,
      },
    ],
  })
}

const renderMermaidTool = createBuddyTool({
  id: "render_mermaid",
  produces: {
    buddyObjectResult: true,
  },
  description: RENDER_MERMAID_DESCRIPTION,
  parameters: RenderMermaidInputSchema,
  async execute(params: RenderMermaidInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "render_mermaid",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind: BUDDY_OBJECT_KINDS.mermaid,
      },
    })

    const parsed = RenderMermaidInputSchema.parse(params)
    const repairOfObjectID = parsed.repairOfObjectID
    const autoRepairRequestID = readAutoRepairRequestID({
      messages: ctx.messages,
      currentMessageID: ctx.messageID,
    })
    const { previousObjectID, ignoredRepairOfObjectID } = await resolveRepairTarget({
      directory: ctx.directory,
      isAutoRepair: isAutoRepairTurn({
        messages: ctx.messages,
        currentMessageID: ctx.messageID,
      }),
      ...(repairOfObjectID ? { repairOfObjectID } : {}),
    })
    if (previousObjectID) {
      const manifest = await readMermaidObjectManifest(ctx.directory, previousObjectID)
      if (manifest.origin?.kind === "tool" && manifest.origin.sessionID !== String(ctx.sessionID)) {
        throw new Error("Mermaid repair target must belong to the current session.")
      }
    }
    const autoRepairRequest = autoRepairRequestID
      ? await readMermaidRepairRequest(ctx.directory, autoRepairRequestID)
      : undefined
    if (autoRepairRequest && autoRepairRequest.objectID !== previousObjectID) {
      throw new Error("Mermaid repair request does not match the requested object.")
    }

    const object = await createToolMermaidObject({
      directory: ctx.directory,
      sessionID: String(ctx.sessionID),
      messageID: String(ctx.messageID),
      callID: createdByCallID(ctx),
      alt: parsed.alt,
      ...(parsed.caption ? { caption: parsed.caption } : {}),
      source: parsed.source,
      ...(previousObjectID ? { repairOfObjectID: previousObjectID } : {}),
      ...(previousObjectID && autoRepairRequestID ? { autoRepairRequestID } : {}),
      ...(autoRepairRequest
        ? { expectedSupersededRevisionID: autoRepairRequest.revisionID }
        : {}),
    })

    const buddyObjectResult = buildRenderMermaidObjectResult({
      objectID: object.objectID,
      revisionID: object.revisionID,
      title: object.title,
      alt: object.alt,
      caption: object.caption ?? null,
      source: object.source,
      renderStatus: object.renderStatus,
    })

    return {
      title: "Mermaid diagram queued",
      output: [
        buddyObjectResult.message,
        ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        `revision_id=${object.revisionID}`,
        ...(ignoredRepairOfObjectID
          ? [
              "",
              `Ignored repairOfObjectID "${ignoredRepairOfObjectID}" because no existing Mermaid object with that ID was found. Omit repairOfObjectID for new diagrams; only pass an ID copied from a prior failed Mermaid object when repairing it.`,
            ]
          : []),
      ].join("\n"),
      metadata: {
        buddyObjectResult,
      },
    }
  },
})

export { renderMermaidTool }
