import { Option, Schema } from "effect"
import { hasFunctionValue, type TJsonObject } from "./parse-external"

export const TOOL_PRESENTATION_PHASES = ["pending", "running", "completed", "error"] as const
export const TOOL_PRESENTATION_ARCHETYPES = [
  "activity",
  "inline-output",
  "interaction",
  "silent",
] as const
export const TOOL_ACTION_ICONS = [
  "tool",
  "read",
  "edit",
  "search",
  "terminal",
  "web",
  "skill",
  "subagent",
  "question",
  "image",
  "diagram",
  "presentation",
  "calculator",
  "todo",
  "file",
  "network",
  "widget",
  "memory",
  "book",
  "goal",
] as const
export const TOOL_RENDERER_TOKENS = [
  "generic",
  "read",
  "search",
  "edit",
  "apply-patch",
  "bash",
  "calculator",
  "web-search",
  "web-fetch",
  "task",
  "skill",
  "figure",
  "mermaid",
  "question-set",
  "flashcard-deck",
  "image-generation",
  "media",
  "html-widget",
  "question",
  "knowledge-graph",
  "full-text",
  "bench-present",
  "buddy-custom",
  "todo",
] as const
export const TOOL_LAYOUT_ROLES = [
  "prose",
  "activity",
  "compact-output",
  "card-output",
  "media-output",
] as const
export const TOOL_COLLECTION_TOKENS = [
  "image-gallery",
  "figure-gallery",
  "mermaid-gallery",
  "full-text-collection",
  "bench-present-collection",
] as const
export const TOOL_NEUTRAL_OUTCOMES = ["permission-denied", "cancelled", "interrupted"] as const
export const TOOL_SILENT_OUTCOMES = [
  "explicit",
  "scoped-reading-fallback",
  /** The call changed nothing worth pointing at, such as closing or re-presenting Bench. */
  "no-op",
] as const

export type ToolPresentationPhase = (typeof TOOL_PRESENTATION_PHASES)[number]
export type ToolPresentationArchetype = (typeof TOOL_PRESENTATION_ARCHETYPES)[number]
export type ToolActionIcon = (typeof TOOL_ACTION_ICONS)[number]
export type ToolRendererToken = (typeof TOOL_RENDERER_TOKENS)[number]
export type ToolLayoutRole = (typeof TOOL_LAYOUT_ROLES)[number]
export type ToolCollectionToken = (typeof TOOL_COLLECTION_TOKENS)[number]
export type ToolNeutralOutcome = (typeof TOOL_NEUTRAL_OUTCOMES)[number]
export type ToolSilentOutcome = (typeof TOOL_SILENT_OUTCOMES)[number]

export type ToolPresentationResolutionContext = {
  toolID: string
  phase: ToolPresentationPhase
  input: Readonly<TJsonObject>
  metadata: Readonly<TJsonObject>
  title?: string
  output?: string
  error?: string
}

export type ToolPresentationDetailResolver = (
  context: ToolPresentationResolutionContext,
) => string | undefined

export type ToolPresentationPhaseCopy = {
  action: string
  detail?: string | ToolPresentationDetailResolver
}

export type ToolPresentationPhaseMap = {
  pending: ToolPresentationPhaseCopy
  running: ToolPresentationPhaseCopy
  completed: ToolPresentationPhaseCopy
  error: ToolPresentationPhaseCopy
}

export type ToolPresentationSummaryMap = {
  category: string
  pending: string
  running: string
  completed: string
  error: string
}

type VisibleToolPresentationDescriptor = {
  phases: ToolPresentationPhaseMap
  icon: ToolActionIcon
  renderer: ToolRendererToken
}

export type ActivityToolPresentationDescriptor = VisibleToolPresentationDescriptor & {
  archetype: "activity"
  layoutRole: "activity"
  summary: ToolPresentationSummaryMap
}

export type InlineOutputToolPresentationDescriptor = VisibleToolPresentationDescriptor & {
  archetype: "inline-output"
  layoutRole: "compact-output" | "card-output" | "media-output"
  /**
   * Keep active work in the transcript activity strip, then switch to the
   * inline renderer only after the tool completes successfully.
   */
  activeDisplay?: "activity"
  collection?: ToolCollectionToken
  resolveSilentOutcome?: (
    context: ToolPresentationResolutionContext,
  ) => ToolSilentOutcome | undefined
}

export type InteractionToolPresentationDescriptor = VisibleToolPresentationDescriptor & {
  archetype: "interaction"
  layoutRole: "compact-output"
}

export type SilentToolPresentationDescriptor = {
  archetype: "silent"
}

export type ToolPresentationDescriptor =
  | ActivityToolPresentationDescriptor
  | InlineOutputToolPresentationDescriptor
  | InteractionToolPresentationDescriptor
  | SilentToolPresentationDescriptor

export function defineToolPresentation<const Descriptor extends ToolPresentationDescriptor>(
  descriptor: Descriptor,
): Descriptor {
  return descriptor
}

function clonePhaseCopy(copy: ToolPresentationPhaseCopy): ToolPresentationPhaseCopy {
  return Object.assign(
    { action: copy.action },
    copy.detail !== undefined ? { detail: copy.detail } : undefined,
  )
}

function clonePhaseMap(phases: ToolPresentationPhaseMap): ToolPresentationPhaseMap {
  return {
    pending: clonePhaseCopy(phases.pending),
    running: clonePhaseCopy(phases.running),
    completed: clonePhaseCopy(phases.completed),
    error: clonePhaseCopy(phases.error),
  }
}

export function cloneToolPresentationDescriptor(
  descriptor: ToolPresentationDescriptor,
): ToolPresentationDescriptor {
  switch (descriptor.archetype) {
    case "silent":
      return { archetype: "silent" }
    case "activity":
      return {
        ...descriptor,
        phases: clonePhaseMap(descriptor.phases),
        summary: { ...descriptor.summary },
      }
    case "inline-output":
      return {
        ...descriptor,
        phases: clonePhaseMap(descriptor.phases),
      }
    case "interaction":
      return {
        ...descriptor,
        phases: clonePhaseMap(descriptor.phases),
      }
  }
}

const ToolPresentationPhaseSchema = Schema.Literals(TOOL_PRESENTATION_PHASES)
const ToolActionIconSchema = Schema.Literals(TOOL_ACTION_ICONS)
const ToolRendererTokenSchema = Schema.Literals(TOOL_RENDERER_TOKENS)
const ToolCollectionTokenSchema = Schema.Literals(TOOL_COLLECTION_TOKENS)
const ToolNeutralOutcomeSchema = Schema.Literals(TOOL_NEUTRAL_OUTCOMES)
const ToolSilentOutcomeSchema = Schema.Literals(TOOL_SILENT_OUTCOMES)

const ActiveOutcomeSchema = Schema.Struct({ type: Schema.Literal("active") })
const SuccessOutcomeSchema = Schema.Struct({ type: Schema.Literal("success") })
const FailureOutcomeSchema = Schema.Struct({ type: Schema.Literal("failure") })
const NeutralOutcomeSchema = Schema.Struct({
  type: Schema.Literal("neutral"),
  reason: ToolNeutralOutcomeSchema,
})
const SilentOutcomeSchema = Schema.Struct({
  type: Schema.Literal("silent"),
  reason: ToolSilentOutcomeSchema,
})

export const ToolPresentationOutcomeSchema = Schema.Union([
  ActiveOutcomeSchema,
  SuccessOutcomeSchema,
  FailureOutcomeSchema,
  NeutralOutcomeSchema,
  SilentOutcomeSchema,
])

const visibleSnapshotFields = {
  version: Schema.Literal(1),
  phase: ToolPresentationPhaseSchema,
  action: Schema.String,
  detail: Schema.optional(Schema.String),
  icon: ToolActionIconSchema,
  renderer: ToolRendererTokenSchema,
  outcome: ToolPresentationOutcomeSchema,
}

const ActivityToolPresentationSnapshotSchema = Schema.Struct({
  ...visibleSnapshotFields,
  archetype: Schema.Literal("activity"),
  layoutRole: Schema.Literal("activity"),
  summary: Schema.Struct({
    category: Schema.String,
    label: Schema.String,
  }),
})

const InlineOutputToolPresentationSnapshotSchema = Schema.Struct({
  ...visibleSnapshotFields,
  archetype: Schema.Literal("inline-output"),
  layoutRole: Schema.Literals(["compact-output", "card-output", "media-output"]),
  activeDisplay: Schema.optional(Schema.Literal("activity")),
  collection: Schema.optional(ToolCollectionTokenSchema),
})

const InteractionToolPresentationSnapshotSchema = Schema.Struct({
  ...visibleSnapshotFields,
  archetype: Schema.Literal("interaction"),
  layoutRole: Schema.Literal("compact-output"),
})

const SilentToolPresentationSnapshotSchema = Schema.Struct({
  version: Schema.Literal(1),
  phase: ToolPresentationPhaseSchema,
  archetype: Schema.Literal("silent"),
  outcome: SilentOutcomeSchema,
})

export const ToolPresentationSnapshotSchema = Schema.Union([
  ActivityToolPresentationSnapshotSchema,
  InlineOutputToolPresentationSnapshotSchema,
  InteractionToolPresentationSnapshotSchema,
  SilentToolPresentationSnapshotSchema,
])

export type ToolPresentationOutcome = Schema.Schema.Type<typeof ToolPresentationOutcomeSchema>
export type ToolPresentationSnapshot = Schema.Schema.Type<typeof ToolPresentationSnapshotSchema>

const INTERRUPTED_PRESENTATION_ACTION = "Interrupted"

export function decodeToolPresentationSnapshot<TValue>(
  value: TValue,
): ToolPresentationSnapshot | undefined {
  const decoded = Schema.decodeUnknownOption(ToolPresentationSnapshotSchema)(value)
  return Option.isSome(decoded) ? decoded.value : undefined
}

/**
 * Reconcile an active wire snapshot when its owning assistant message terminates
 * before the tool reports a terminal state. This keeps state and presentation
 * atomic without requiring the frontend recovery path to resolve a descriptor.
 */
export function interruptToolPresentationSnapshot(
  snapshot: ToolPresentationSnapshot,
): ToolPresentationSnapshot {
  const phase: ToolPresentationPhase = "error"
  const outcome: ToolPresentationOutcome = { type: "neutral", reason: "interrupted" }

  switch (snapshot.archetype) {
    case "silent":
      return {
        ...snapshot,
        phase,
      }
    case "activity": {
      const { detail: _detail, ...snapshotWithoutDetail } = snapshot
      return {
        ...snapshotWithoutDetail,
        phase,
        action: INTERRUPTED_PRESENTATION_ACTION,
        outcome,
        summary: {
          ...snapshot.summary,
          label: INTERRUPTED_PRESENTATION_ACTION,
        },
      }
    }
    case "inline-output":
    case "interaction": {
      const { detail: _detail, ...snapshotWithoutDetail } = snapshot
      return {
        ...snapshotWithoutDetail,
        phase,
        action: INTERRUPTED_PRESENTATION_ACTION,
        outcome,
      }
    }
  }
}

const PERMISSION_DENIED_PREFIX = "The user rejected permission to use this specific tool call"

function isInterrupted(context: ToolPresentationResolutionContext): boolean {
  return context.metadata.interrupted === true
}

function isQuestionCancellation(context: ToolPresentationResolutionContext): boolean {
  if (context.toolID !== "question") return false
  const error = context.error?.toLowerCase()
  return error?.includes("questionrejectederror") === true || error?.includes("rejected") === true
}

export function resolveToolPresentationOutcome(
  context: ToolPresentationResolutionContext,
  resolveSilentOutcome?: InlineOutputToolPresentationDescriptor["resolveSilentOutcome"],
): ToolPresentationOutcome {
  if (context.phase === "pending" || context.phase === "running") {
    return { type: "active" }
  }

  const silentReason = resolveSilentOutcome?.(context)
  if (silentReason) {
    return { type: "silent", reason: silentReason }
  }

  if (context.phase === "completed") {
    return { type: "success" }
  }

  if (isInterrupted(context)) {
    return { type: "neutral", reason: "interrupted" }
  }
  if (context.error?.startsWith(PERMISSION_DENIED_PREFIX)) {
    return { type: "neutral", reason: "permission-denied" }
  }
  if (isQuestionCancellation(context)) {
    return { type: "neutral", reason: "cancelled" }
  }
  return { type: "failure" }
}

function normalizePresentationText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function isPresentationDetailResolver(
  value: ToolPresentationPhaseCopy["detail"],
): value is ToolPresentationDetailResolver {
  return hasFunctionValue(value)
}

function resolvePhaseDetail(
  copy: ToolPresentationPhaseCopy,
  context: ToolPresentationResolutionContext,
): string | undefined {
  const detail = isPresentationDetailResolver(copy.detail) ? copy.detail(context) : copy.detail
  return normalizePresentationText(detail)
}

function neutralAction(outcome: ToolPresentationOutcome): string | undefined {
  if (outcome.type !== "neutral") return undefined
  switch (outcome.reason) {
    case "permission-denied":
      return "Permission denied"
    case "cancelled":
      return "Cancelled"
    case "interrupted":
      return "Interrupted"
  }
}

export function resolveToolPresentationSnapshot(
  descriptor: ToolPresentationDescriptor,
  context: ToolPresentationResolutionContext,
): ToolPresentationSnapshot {
  if (descriptor.archetype === "silent") {
    return {
      version: 1,
      archetype: "silent",
      phase: context.phase,
      outcome: { type: "silent", reason: "explicit" },
    }
  }

  const copy = descriptor.phases[context.phase]
  const outcome = resolveToolPresentationOutcome(
    context,
    descriptor.archetype === "inline-output" ? descriptor.resolveSilentOutcome : undefined,
  )
  const action = neutralAction(outcome) ?? copy.action
  const detail = outcome.type === "neutral" ? undefined : resolvePhaseDetail(copy, context)
  const common = Object.assign(
    {
      version: 1 as const,
      phase: context.phase,
      action,
      icon: descriptor.icon,
      renderer: descriptor.renderer,
      outcome,
    },
    detail ? { detail } : undefined,
  )

  switch (descriptor.archetype) {
    case "activity":
      return {
        ...common,
        archetype: "activity",
        layoutRole: "activity",
        summary: {
          category: descriptor.summary.category,
          label: descriptor.summary[context.phase],
        },
      }
    case "inline-output":
      return Object.assign(
        {
          ...common,
          archetype: "inline-output" as const,
          layoutRole: descriptor.layoutRole,
        },
        descriptor.activeDisplay ? { activeDisplay: descriptor.activeDisplay } : undefined,
        descriptor.collection ? { collection: descriptor.collection } : undefined,
      )
    case "interaction":
      return {
        ...common,
        archetype: "interaction",
        layoutRole: "compact-output",
      }
  }
}
