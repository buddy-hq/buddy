import { createHash } from "node:crypto"
import type { PromptContext, PromptTurnSnapshot } from "../context"
import {
  buildLearnerContextView,
  decideLearnerContextDelivery,
} from "../../shared/learner-context-delivery"
import { hasText } from "../utils"
import READING_TURN_CONTEXT_TEMPLATE_SOURCE from "./reading-turn-context.t.md"
import TEACHING_TURN_CONTEXT_TEMPLATE_SOURCE from "./teaching-turn-context.t.md"
import { definePromptTemplate } from "../template/engine"
import { checkpointReminder } from "./checkpoint-reminder"
import type { TurnReminderDefinition, TurnReminderContext } from "./definition"
import { learnerMemoryReminder } from "./learner-memory-reminder"
import { turnTransitionReminder } from "./turn-transitions"

export type BuddyUserPreludePart = {
  type: "text"
  text: string
  synthetic: true
}

export type BuddyUserPreludeBuild = {
  parts: readonly BuddyUserPreludePart[]
  turnContextDelivery: {
    currentReadingFingerprint?: string
    deliveredReadingFingerprint?: string
    currentBenchFingerprint?: string
    deliveredBenchFingerprint?: string
    currentTeachingFingerprint?: string
    deliveredTeachingFingerprint?: string
  }
}

type TurnContextPartBuild = {
  text?: string
  fingerprint?: string
}

const READING_TURN_CONTEXT_TEMPLATE = definePromptTemplate({
  source: READING_TURN_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/user-prelude/reading-turn-context.t.md",
})

const TEACHING_TURN_CONTEXT_TEMPLATE = definePromptTemplate({
  source: TEACHING_TURN_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/user-prelude/teaching-turn-context.t.md",
})

const TURN_REMINDERS: readonly TurnReminderDefinition[] = [
  learnerMemoryReminder,
  turnTransitionReminder,
  checkpointReminder,
]

function fingerprintText(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function shortFingerprint(value: string): string {
  return value.slice(0, 12)
}

function buildReadingTurnContextPart(context: PromptContext): TurnContextPartBuild {
  const resource = context.activeResource
  if (!resource) return {}

  const fields = [
    ...(resource.cfi ? [`cfi=${resource.cfi}`] : []),
    ...(resource.index !== undefined ? [`index=${resource.index}`] : []),
    ...(resource.fraction !== undefined ? [`fraction=${resource.fraction}`] : []),
    ...(resource.tocLabel ? [`toc=${resource.tocLabel}`] : []),
    ...(resource.pageLabel ? [`page=${resource.pageLabel}`] : []),
    ...(resource.locationLabel ? [`location=${resource.locationLabel}`] : []),
  ]
  const optionalFields = fields.length === 0 ? "" : `${fields.join("\n")}\n`
  const currentPassageBlock = resource.currentPassageText
    ? `current_passage:\n${resource.currentPassageText}\n`
    : ""
  const visibleStartTextBlock = resource.visibleStartText
    ? `visible_start:\n${resource.visibleStartText}\n`
    : ""
  const visibleEndTextBlock = resource.visibleEndText
    ? `visible_end:\n${resource.visibleEndText}\n`
    : ""
  const readingTrailBlock = resource.readingTrail?.length
    ? `reading_trail:\n${resource.readingTrail
        .map(
          (entry) =>
            `  - ${entry.tocLabel}${entry.cfi ? ` (cfi=${entry.cfi})` : ""}${entry.fraction !== undefined ? ` (fraction=${entry.fraction})` : ""}`,
        )
        .join("\n")}\n`
    : ""
  const annotationSummaryBlock = resource.annotationSummary?.length
    ? `recent_annotations:\n${resource.annotationSummary
        .map(
          (entry) =>
            `  - "${entry.text.slice(0, 200)}"${entry.note ? ` (note: ${entry.note.slice(0, 200)})` : ""}`,
        )
        .join("\n")}\n`
    : ""

  const text = READING_TURN_CONTEXT_TEMPLATE.render({
    title: resource.title,
    path: resource.path,
    optional_fields: optionalFields,
    current_passage_block: currentPassageBlock,
    visible_start_text_block: visibleStartTextBlock,
    visible_end_text_block: visibleEndTextBlock,
    reading_trail_block: readingTrailBlock,
    annotation_summary_block: annotationSummaryBlock,
  })
  const fingerprint = fingerprintText(text)
  if (context.priorDeliveredReadingTurnContextDigest === fingerprint) {
    return {
      fingerprint,
      text: `<reading_ctx_ref same="${shortFingerprint(fingerprint)}"/>`,
    }
  }

  return {
    fingerprint,
    text,
  }
}

function buildTeachingTurnContextPart(input: {
  context: PromptContext
  changedSinceCheckpoint?: boolean
}): TurnContextPartBuild {
  const teaching = input.context.teachingContext
  if (!teaching?.active) return {}

  const selection =
    teaching.selectionStartLine !== undefined &&
    teaching.selectionStartColumn !== undefined &&
    teaching.selectionEndLine !== undefined &&
    teaching.selectionEndColumn !== undefined
      ? `Selection: L${teaching.selectionStartLine}:C${teaching.selectionStartColumn}-L${teaching.selectionEndLine}:C${teaching.selectionEndColumn}`
      : undefined

  const lines = [
    `Session: ${teaching.sessionID}`,
    `Revision: ${teaching.revision}`,
    selection,
    `Checkpoint: ${input.changedSinceCheckpoint ? "pending acceptance" : "accepted"}`,
  ].filter((line): line is string => line !== undefined)

  const text = TEACHING_TURN_CONTEXT_TEMPLATE.render({
    details: `${lines.join("\n")}\n`,
  })
  const fingerprint = fingerprintText(text)
  if (input.context.priorDeliveredTeachingTurnContextDigest === fingerprint) {
    return {
      fingerprint,
      text: `<teaching_ctx_ref same="${shortFingerprint(fingerprint)}"/>`,
    }
  }

  return {
    fingerprint,
    text,
  }
}

const BENCH_TURN_CONTEXT_METADATA_LIMIT = 5

function benchSurfaceLabel(context: PromptContext): string {
  const benchContext = context.benchContext
  if (!benchContext || benchContext.status === "closed") return "Bench"

  const target = benchContext.target
  if (target.type === "object") {
    return `${target.ref.kind} object`
  }
  return target.path.toLowerCase().endsWith(".md") ? "markdown file" : "workspace file"
}

function benchDrawerStatusLine(context: PromptContext): string {
  const benchContext = context.benchContext
  if (!benchContext || benchContext.status === "closed") return "No Bench target is loaded."
  if (!benchContext.drawer) return "No Explorer or Library drawer is open over the target."
  const drawerLabel = benchContext.drawer.kind === "explorer" ? "Explorer" : "Library"
  return `${drawerLabel} is open as a drawer over the loaded Bench target. The target remains loaded, but the drawer is currently over it.`
}

function isBenchShowingActiveResource(context: PromptContext): boolean {
  const benchContext = context.benchContext
  const activeResource = context.activeResource
  if (!benchContext || benchContext.status === "closed" || !activeResource?.objectID) {
    return false
  }
  return (
    benchContext.target.type === "object" &&
    benchContext.target.ref.kind === "resource" &&
    benchContext.target.ref.objectID === activeResource.objectID
  )
}

function buildBenchTurnContextPart(context: PromptContext): TurnContextPartBuild {
  const benchContext = context.benchContext
  if (!benchContext || benchContext.status === "closed") return {}
  if (isBenchShowingActiveResource(context)) return {}

  const target = benchContext.target
  const targetLines =
    target.type === "object"
      ? [
          `Title: ${target.title}`,
          `Object kind: ${target.ref.kind}`,
          `Object ID: ${target.ref.objectID}`,
          target.ref.revisionID ? `Revision ID: ${target.ref.revisionID}` : undefined,
          target.ref.itemID ? `Item ID: ${target.ref.itemID}` : undefined,
          `View ID: ${target.viewID}`,
          `State: ${target.status}`,
        ]
      : [
          `Title: ${target.title}`,
          `Path: ${target.path}`,
          `Absolute path: ${target.absolutePath}`,
          `State: ${target.status}`,
        ]
  const locationLines = targetLines.filter((line): line is string => line !== undefined)
  const metadataLines = benchContext.metadata
    .slice(0, BENCH_TURN_CONTEXT_METADATA_LIMIT)
    .map((line) => `- ${line}`)
  const metadataBlock = metadataLines.length > 0 ? `Details:\n${metadataLines.join("\n")}\n` : ""

  const text = [
    "<bench_turn_context>",
    `The learner has Bench loaded with ${benchSurfaceLabel(context)}.`,
    benchDrawerStatusLine(context),
    locationLines.join("\n"),
    metadataBlock.trimEnd(),
    "Use bench_read_context if the learner refers to Bench contents or if exact current Bench context matters.",
    "</bench_turn_context>",
  ]
    .filter((line) => line.length > 0)
    .join("\n")
  const fingerprint = fingerprintText(text)
  if (context.priorDeliveredBenchTurnContextDigest === fingerprint) {
    return {
      fingerprint,
      text: `<bench_ctx_ref same="${shortFingerprint(fingerprint)}"/>`,
    }
  }

  return {
    fingerprint,
    text,
  }
}

export function buildBuddyUserPrelude(input: {
  context: PromptContext
  changedSinceCheckpoint?: boolean
}): BuddyUserPreludeBuild {
  const learnerContextView = buildLearnerContextView(input.context.learnerSnapshot)
  const learnerContextDelivery = decideLearnerContextDelivery({
    current: {
      ...learnerContextView,
      fingerprint: input.context.learnerContextDigest ?? learnerContextView.fingerprint,
    },
    previousFingerprint: input.context.priorLearnerContextDigest,
    previousItems: input.context.priorLearnerContextItems,
  })
  const currentTurn = {
    persona: input.context.persona,
    teachingWorkspaceState: input.context.teachingWorkspaceState,
  } satisfies PromptTurnSnapshot

  const reminderContext: TurnReminderContext = {
    ...input.context,
    changedSinceCheckpoint: input.changedSinceCheckpoint,
    currentTurn,
    learnerContextDelivery,
  }

  const reminderLines = TURN_REMINDERS.flatMap((definition) => {
    if (definition.when && !definition.when(reminderContext)) {
      return []
    }
    const rendered = definition.render(reminderContext)
    if (!rendered) {
      return []
    }
    if (Array.isArray(rendered)) {
      return rendered.filter((line): line is string => hasText(line))
    }
    return typeof rendered === "string" && hasText(rendered) ? [rendered] : []
  })

  const readingTurnContext = buildReadingTurnContextPart(input.context)
  const benchTurnContext = buildBenchTurnContextPart(input.context)
  const teachingTurnContext = buildTeachingTurnContextPart({
    context: input.context,
    changedSinceCheckpoint: input.changedSinceCheckpoint,
  })

  const contextLines = [
    readingTurnContext.text,
    benchTurnContext.text,
    teachingTurnContext.text,
  ].filter((line): line is string => line !== undefined)

  const sectionLines = [
    ...contextLines,
    ...(reminderLines.length > 0 ? [reminderLines.join("\n")] : []),
  ]
  const preludeParts: BuddyUserPreludePart[] =
    sectionLines.length === 0
      ? []
      : [
          {
            type: "text",
            text: `<system-reminder>\n${sectionLines.join("\n\n")}\n</system-reminder>`,
            synthetic: true,
          },
        ]

  return {
    parts: preludeParts,
    turnContextDelivery: {
      ...(readingTurnContext.fingerprint
        ? { currentReadingFingerprint: readingTurnContext.fingerprint }
        : {}),
      ...(readingTurnContext.text && readingTurnContext.fingerprint
        ? { deliveredReadingFingerprint: readingTurnContext.fingerprint }
        : {}),
      ...(benchTurnContext.fingerprint
        ? { currentBenchFingerprint: benchTurnContext.fingerprint }
        : {}),
      ...(benchTurnContext.text && benchTurnContext.fingerprint
        ? { deliveredBenchFingerprint: benchTurnContext.fingerprint }
        : {}),
      ...(teachingTurnContext.fingerprint
        ? { currentTeachingFingerprint: teachingTurnContext.fingerprint }
        : {}),
      ...(teachingTurnContext.text && teachingTurnContext.fingerprint
        ? { deliveredTeachingFingerprint: teachingTurnContext.fingerprint }
        : {}),
    },
  }
}
