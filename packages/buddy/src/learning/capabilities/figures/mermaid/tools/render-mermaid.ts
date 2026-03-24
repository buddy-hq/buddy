import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"
import { normalizeMermaidSource } from "../normalize"
import { MAX_REPAIR_PASSES, runMermaidRepairPass } from "../repair"
import { MermaidArtifactService, MermaidRenderError } from "../service"
import {
  MermaidArtifactManifestSchema,
  RenderMermaidInputSchema,
  RenderMermaidOutputSchema,
  type RenderMermaidInput,
  type RenderMermaidOutput,
} from "../types"

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

async function repairAndValidateMermaid(input: { source: string }): Promise<{
  source: string
  repairAttempts: number
  repairLog: string[]
}> {
  let currentSource = normalizeMermaidSource(input.source)
  let repairAttempts = 0
  const repairLog: string[] = []

  let validation = await MermaidArtifactService.validateSource(currentSource)
  if (validation.ok) {
    return {
      source: currentSource,
      repairAttempts,
      repairLog,
    }
  }

  repairLog.push(`initial validation failed: ${validation.diagnostics.join(" | ")}`)

  for (let pass = 1; pass <= MAX_REPAIR_PASSES; pass += 1) {
    const repaired = runMermaidRepairPass(currentSource)
    if (repaired.source === currentSource) {
      repairLog.push(`pass ${pass}: no additional deterministic repairs were applicable`)
      break
    }

    currentSource = repaired.source
    repairAttempts += 1
    if (repaired.repairLog.length > 0) {
      repairLog.push(...repaired.repairLog.map((entry) => `pass ${pass}: ${entry}`))
    }

    validation = await MermaidArtifactService.validateSource(currentSource)
    if (validation.ok) {
      return {
        source: currentSource,
        repairAttempts,
        repairLog,
      }
    }

    repairLog.push(`pass ${pass}: validation failed: ${validation.diagnostics.join(" | ")}`)
  }

  throw new MermaidRenderError({
    diagnostics: validation.diagnostics,
    repairAttempts,
    repairLog,
  })
}

const renderMermaidTool = createBuddyTool("render_mermaid", {
  description:
    "Render Mermaid diagrams for inline chat display, including flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, gantt, pie, journey, mindmap, timeline, and related Mermaid-supported UML and architecture families. The UI renders the returned diagram automatically after the tool call, so continue the explanation in normal text.",
  parameters: RenderMermaidInputSchema,
  async execute(params: RenderMermaidInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "render_mermaid",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind: params.kind,
      },
    })

    const parsed = RenderMermaidInputSchema.parse(params)
    const repaired = await repairAndValidateMermaid({
      source: parsed.source,
    })

    const source = repaired.source
    const sourceHash = MermaidArtifactService.hashSource(source)
    const diagramType = MermaidArtifactService.inferDiagramType(source)
    const createdAt = new Date().toISOString()
    const artifactID = MermaidArtifactService.hashArtifact({
      kind: parsed.kind,
      diagramType,
      alt: parsed.alt,
      ...(parsed.caption ? { caption: parsed.caption } : {}),
      repairAttempts: repaired.repairAttempts,
      repairLog: repaired.repairLog,
      sourceHash,
      createdAt,
      createdBy: {
        sessionID: String(ctx.sessionID),
        messageID: String(ctx.messageID),
        callID: createdByCallID(ctx),
      },
    })
    const artifactUrl = MermaidArtifactService.buildArtifactUrl(ctx.directory, artifactID)
    const markdown = MermaidArtifactService.buildMarkdown(source)

    const manifest = MermaidArtifactManifestSchema.parse({
      version: 1,
      artifactID,
      kind: parsed.kind,
      diagramType,
      alt: parsed.alt,
      ...(parsed.caption ? { caption: parsed.caption } : {}),
      repairAttempts: repaired.repairAttempts,
      repairLog: repaired.repairLog,
      sourceHash,
      createdAt,
      createdBy: {
        sessionID: String(ctx.sessionID),
        messageID: String(ctx.messageID),
        callID: createdByCallID(ctx),
      },
    })

    await MermaidArtifactService.write({
      directory: ctx.directory,
      manifest,
      source,
    })

    const output: RenderMermaidOutput = RenderMermaidOutputSchema.parse({
      artifactID,
      kind: parsed.kind,
      mime: "application/vnd.mermaid",
      alt: parsed.alt,
      ...(parsed.caption ? { caption: parsed.caption } : {}),
      diagramType,
      repairAttempts: repaired.repairAttempts,
      repairLog: repaired.repairLog,
      source,
      artifactUrl,
      markdown,
    })

    return {
      title: "Rendered Mermaid diagram",
      output: JSON.stringify(output, null, 2),
      metadata: {
        artifact: "RenderMermaidOutput",
        value: output,
      },
    }
  },
})

export { renderMermaidTool }
