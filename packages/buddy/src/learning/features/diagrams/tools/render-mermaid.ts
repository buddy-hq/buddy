import RENDER_MERMAID_DESCRIPTION from "./render-mermaid.md"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import z from "zod"
import {
  MERMAID_ARTIFACT_KIND,
  MermaidArtifactManifestSchema,
  RenderMermaidOutputSchema,
  type RenderMermaidOutput,
} from "../service/types"
import { normalizeMermaidSource } from "../service/normalize"
import { MermaidRenderError } from "../errors"
import {
  hashMermaidSource,
  hashMermaidArtifact,
  buildMermaidArtifactUrl,
  buildMermaidMarkdown,
  inferMermaidDiagramType,
  writeMermaidArtifact,
  repairAndValidateMermaid,
} from "../service/render"

const nonEmptyString = z.string().trim().min(1)

const RenderMermaidInputSchema = z.object({
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  source: nonEmptyString,
})

type RenderMermaidInput = z.infer<typeof RenderMermaidInputSchema>

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

const FLOWCHART_TYPES = new Set(["flowchart", "graph"])

function buildDiagnosticHints(diagramType: string, diagnostics: readonly string[]): string {
  const joined = diagnostics.join(" ")
  const hints: string[] = []

  if (FLOWCHART_TYPES.has(diagramType.toLowerCase())) {
    if (/quote|"/iu.test(joined)) {
      hints.push(
        "Replace double quotes inside node labels [...] and edge labels |...| with single quotes.",
      )
    }
    if (/unbalanced|missing.*[}\])]|delimiter/iu.test(joined)) {
      hints.push("Close all subgraph/end blocks and ensure brackets are balanced.")
    }
    if (/incomplete.*connector/iu.test(joined)) {
      hints.push("Ensure every connector (-->, ---, ===) has a target node.")
    }
  } else if (diagramType.toLowerCase() === "timeline") {
    hints.push(
      "Do not quote timeline period labels. Use bare text like '8.00 AM', not '\"8:00 AM\"'. Replace colons in times with dots.",
    )
  } else if (diagramType.toLowerCase() === "erdiagram") {
    hints.push(
      'ER diagram relationship labels must be quoted strings on the relationship line (e.g. ENTITY1 ||--o{ ENTITY2 : "label"). Ensure every relationship line has the correct format: ENTITY CARDINALITY ENTITY : "label".',
    )
  } else {
    if (/unbalanced|delimiter/iu.test(joined)) {
      hints.push("Ensure all brackets, braces, and parentheses are balanced.")
    }
    if (/incomplete.*connector/iu.test(joined)) {
      hints.push("Ensure every connector has a target.")
    }
  }

  if (hints.length === 0) {
    hints.push("Review the mermaid syntax for errors and fix them.")
  }

  return `Suggested fixes: ${hints.join(" ")}`
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
    const inferredDiagramType = inferMermaidDiagramType(normalizeMermaidSource(parsed.source))

    let repaired: Awaited<ReturnType<typeof repairAndValidateMermaid>>
    try {
      repaired = await repairAndValidateMermaid({
        source: parsed.source,
      })
    } catch (error) {
      if (error instanceof MermaidRenderError) {
        const issues = error.diagnostics.join("; ")
        const contextualHints = buildDiagnosticHints(inferredDiagramType, error.diagnostics)
        const hints = [
          `Mermaid ${inferredDiagramType} diagram failed to render after ${error.repairAttempts} repair attempt(s).`,
          `Issues: ${issues}`,
          contextualHints,
          "Rewrite the mermaid source with these fixes and call render_mermaid again.",
        ]
        return {
          title: "Mermaid render failed",
          output: hints.join(" "),
          metadata: {},
        }
      }
      throw error
    }

    const source = repaired.source
    const sourceHash = hashMermaidSource(source)
    const diagramType = inferMermaidDiagramType(source)
    const createdAt = new Date().toISOString()
    const artifactID = hashMermaidArtifact({
      kind,
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
    const artifactUrl = buildMermaidArtifactUrl(ctx.directory, artifactID)
    const markdown = buildMermaidMarkdown(source)

    const manifest = MermaidArtifactManifestSchema.parse({
      version: 1,
      artifactID,
      kind,
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

    await writeMermaidArtifact({
      directory: ctx.directory,
      manifest,
      source,
    })

    const output: RenderMermaidOutput = RenderMermaidOutputSchema.parse({
      artifactID,
      kind,
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

    const repairNote =
      repaired.repairAttempts > 0
        ? ` The source required ${repaired.repairAttempts} repair pass(es); the rendered version may differ slightly from what you wrote.`
        : ""

    return {
      title: "Rendered Mermaid diagram",
      output: `Mermaid ${diagramType} diagram rendered and displayed to the user (alt: "${parsed.alt}").${repairNote} Continue your explanation in normal text without repeating the diagram source.`,
      metadata: {
        artifact: "RenderMermaidOutput",
        value: output,
      },
    }
  },
})

export { renderMermaidTool }
