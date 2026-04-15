import type { WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { getIntentPrompt } from "../intents/get-intent-prompt"
import type { BuddyPromptBuildContext } from "./contracts"
import TEACHING_WORKSPACE_POLICY from "./teaching-workspace-policy.p.md"
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_PROCESSED_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_TOC_FILE_NAME,
} from "../../resource-packs/contracts"

type LearnerSnapshotContext = BuddyPromptBuildContext["learnerSnapshot"]
type RuntimePromptProfile = Pick<BuddyPromptBuildContext, "persona" | "capabilityEnvelope">
type TeachingContext = NonNullable<BuddyPromptBuildContext["teachingContext"]>
type ResourceContext = BuddyPromptBuildContext["resources"][number]
type ModelContext = BuddyPromptBuildContext["model"]

const RESOURCE_CONTEXT_TAG_OPEN = "<notebook_resources>" as const
const RESOURCE_CONTEXT_TAG_CLOSE = "</notebook_resources>" as const
const RESOURCE_INVENTORY_DETAILED_MAX_ITEMS = 7
const RESOURCE_INVENTORY_ALIAS_ONLY_MAX_ITEMS = 20
const RESOURCE_PATH_PREVIEW_MAX_CHARS = 120
const RESOURCE_WARNING_PREVIEW_MAX_CHARS = 140

type TeachingCheckpointStatus = {
  changedSinceLastCheckpoint: boolean
  trackedFiles: string[]
}

type BuddyRuntimeContextBuild = {
  runtimeContext: string
  changedSinceCheckpoint?: boolean
}

export type BuddySystemContextBuild = {
  systemContext: string
  changedSinceCheckpoint?: boolean
}

function compactLine(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function buildLearnerSummaryText(snapshot: LearnerSnapshotContext): string {
  const relevantGoalIds = snapshot.goals.map((goal) => goal.id)
  const goalLines = snapshot.goals
    .slice(0, 6)
    .map((goal) => `- ${goal.statement} [test: ${goal.howToTest}]`)
  const constraintLines = snapshot.constraintsSummary.map(
    (line) => `- Constraint: ${compactLine(line)}`,
  )

  return [
    "<learner_state>",
    `Workspace: ${snapshot.workspace.label}`,
    relevantGoalIds.length > 0
      ? `Relevant goals: ${relevantGoalIds.join(", ")}`
      : "No relevant goals exist yet. Define goals before sequencing practice.",
    ...goalLines,
    ...constraintLines,
    "</learner_state>",
  ].join("\n")
}

function buildLearnerContextSections(snapshot: LearnerSnapshotContext): {
  learnerSummary: string
  learnerProgress: string
  learnerFeedback: string
} {
  const summary = buildLearnerSummaryText(snapshot)

  const progressLines = [
    `Goals in scope: ${snapshot.goals.length}`,
    `Evidence records: ${snapshot.recentEvidence.length}`,
    `Open feedback items: ${snapshot.openFeedback.length}`,
    `Active misconceptions: ${snapshot.activeMisconceptions.length}`,
  ]

  const progress = [
    "<learner_progress>",
    ...progressLines.map((line) => `- ${compactLine(line)}`),
    "</learner_progress>",
  ].join("\n")

  const openFeedbackLines = snapshot.openFeedback
    .map((record) => compactLine(record.requiredAction))
    .slice(0, 8)
  const misconceptionLines = snapshot.activeMisconceptions
    .map((record) => compactLine(record.summary))
    .slice(0, 8)

  const feedback = [
    "<learner_feedback>",
    ...(openFeedbackLines.length > 0
      ? openFeedbackLines.map((line) => `- ${line}`)
      : ["- No open feedback actions."]),
    ...(misconceptionLines.length > 0
      ? misconceptionLines.map((line) => `- Misconception: ${line}`)
      : ["- No active misconceptions."]),
    "</learner_feedback>",
  ].join("\n")

  return {
    learnerSummary: summary,
    learnerProgress: progress,
    learnerFeedback: feedback,
  }
}

function buildWorkspaceStateText(
  profile: RuntimePromptProfile,
  workspaceState: WorkspaceState,
): string {
  const hasEditor = profile.capabilityEnvelope.visibleSurfaces.includes("editor")
  const hasFigure = profile.capabilityEnvelope.visibleSurfaces.includes("figure")

  const guidance = hasEditor
    ? workspaceState === "interactive"
      ? "An interactive lesson workspace is active. Ground coding help in the live lesson files."
      : "No interactive lesson workspace is active. Teach in chat unless the learner explicitly wants an editor-backed lesson."
    : hasFigure
      ? "Teach primarily through chat. Render a figure only when it materially improves the current explanation."
      : "Teach through normal chat. Use learner state and project context to stay grounded."

  return `<workspace_state>\nState: ${workspaceState}\n${guidance}\n</workspace_state>`
}

function buildCalculatorRuntimeText(profile: RuntimePromptProfile): string | undefined {
  if (profile.capabilityEnvelope.tools.python_calculator !== "allow") {
    return undefined
  }

  return [
    "<calculator_runtime>",
    "python_calculator is available in this session.",
    "Before making any mathematical claim or validating a worked result, call python_calculator first.",
    "Prefer exact symbolic forms such as fractions, radicals, and symbolic constants before decimal approximations when possible.",
    "</calculator_runtime>",
  ].join("\n")
}

function buildModelRuntimeText(model: ModelContext): string | undefined {
  if (!model) {
    return undefined
  }

  return [
    "<model_limits>",
    `Active model: ${model.providerID}/${model.modelID}`,
    `Context window: ${model.contextWindow}`,
    ...(model.inputWindow !== undefined ? [`Input window: ${model.inputWindow}`] : []),
    `Output window: ${model.outputWindow}`,
    "</model_limits>",
  ].join("\n")
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function firstWarningText(warnings: string[]): string | undefined {
  const warning = warnings.find((entry) => entry.trim().length > 0)
  if (!warning) return undefined
  return clampText(compactLine(warning), RESOURCE_WARNING_PREVIEW_MAX_CHARS)
}

function formatResourceInventoryLine(resource: ResourceContext): string {
  const sourcePreview = clampText(resource.sourceRelpath, RESOURCE_PATH_PREVIEW_MAX_CHARS)
  const packPath = `${RESOURCE_PACK_ROOT_DIR}/${resource.alias}/${RESOURCE_PACK_PROCESSED_DIR_NAME}`
  const segments = [
    `id=${resource.id}`,
    `alias=${resource.alias}`,
    `format=${resource.format}`,
    `status=${resource.status}`,
    `source=${sourcePreview}`,
    `pack=${packPath}`,
  ]

  if (resource.fullTextPath) {
    segments.push(`full_text=${resource.fullTextPath}`)
  }
  if (resource.fullTextEstTokens !== undefined) {
    segments.push(`full_text_est_tokens=${resource.fullTextEstTokens}`)
  }
  if (resource.fullTextChars !== undefined) {
    segments.push(`full_text_chars=${resource.fullTextChars}`)
  }

  const warning = firstWarningText(resource.warnings)
  if (warning) {
    segments.push(`note=${warning}`)
  }

  return `- ${segments.join(" | ")}`
}

function buildActiveResourceContextText(
  resource: BuddyPromptBuildContext["activeResource"],
): string | undefined {
  if (!resource) return undefined

  return [
    "<active_reading_resource>",
    `title=${resource.title}`,
    `path=${resource.path}`,
    ...(resource.id ? [`id=${resource.id}`] : []),
    ...(resource.alias ? [`alias=${resource.alias}`] : []),
    ...(resource.status ? [`status=${resource.status}`] : []),
    ...(resource.tocLabel ? [`toc=${resource.tocLabel}`] : []),
    ...(resource.pageLabel ? [`page=${resource.pageLabel}`] : []),
    ...(resource.locationLabel ? [`location=${resource.locationLabel}`] : []),
    "This is the resource currently open in reading mode. Use it as the default reading context for the current turn.",
    "</active_reading_resource>",
  ].join("\n")
}

function buildResourceContextText(resources: BuddyPromptBuildContext["resources"]): string {
  const lines = [
    RESOURCE_CONTEXT_TAG_OPEN,
    "Resources are notebook-local user-provided reference files.",
    "They are staged under `resources/<alias>/` and prepared text is under `resources/<alias>/processed/`.",
    `When resource evidence is relevant, start from \`${RESOURCE_PACK_ENTRYPOINT_FILE_NAME}\`, then \`${RESOURCE_PACK_TOC_FILE_NAME}\` if present, then \`${RESOURCE_PACK_CHUNKS_DIR_NAME}/\`, \`${RESOURCE_PACK_PAGES_DIR_NAME}/\` (PDF), and \`${RESOURCE_PACK_FULL_TEXT_FILE_PREFIX}-*.md\`.`,
    "Use normal file tools (`read`, `grep`, `glob`, `bash`) and subagents as needed. Do not read every resource by default.",
  ]

  if (resources.length === 0) {
    lines.push("No notebook resources are currently available.")
    lines.push(
      "If external material is needed, ask the learner to add a resource from the Resources panel or with `/resource add`.",
    )
    lines.push(RESOURCE_CONTEXT_TAG_CLOSE)
    return lines.join("\n")
  }

  lines.push("Available resources:")
  const detailedResources = resources.slice(0, RESOURCE_INVENTORY_DETAILED_MAX_ITEMS)
  lines.push(...detailedResources.map(formatResourceInventoryLine))

  const remainingResources = resources.slice(detailedResources.length)
  if (remainingResources.length > 0) {
    const aliasOnlyResources = remainingResources.slice(0, RESOURCE_INVENTORY_ALIAS_ONLY_MAX_ITEMS)
    lines.push(
      `Additional resources (alias only): ${aliasOnlyResources.map((resource) => resource.alias).join(", ")}`,
    )
    const hiddenCount = remainingResources.length - aliasOnlyResources.length
    if (hiddenCount > 0) {
      lines.push(`- ... ${hiddenCount} more resources not listed`)
    }
    lines.push(
      "Inventory is truncated for prompt budget. Inspect `resources/` directly when you need the full list.",
    )
  }
  lines.push(RESOURCE_CONTEXT_TAG_CLOSE)
  return lines.join("\n")
}

function buildTeachingWorkspaceText(input: {
  context: TeachingContext
  checkpointStatus?: TeachingCheckpointStatus
}): string {
  const checkpointStatus = input.checkpointStatus
    ? `\nCheckpoint status: ${input.checkpointStatus.changedSinceLastCheckpoint ? "pending acceptance" : "accepted"}`
    : ""

  const trackedFiles = input.checkpointStatus?.trackedFiles.length
    ? `\nTracked files:\n${input.checkpointStatus.trackedFiles.map((file) => `- ${file}`).join("\n")}`
    : ""

  const selection =
    input.context.selectionStartLine !== undefined &&
    input.context.selectionStartColumn !== undefined &&
    input.context.selectionEndLine !== undefined &&
    input.context.selectionEndColumn !== undefined
      ? `\nSelection: L${input.context.selectionStartLine}:C${input.context.selectionStartColumn}-L${input.context.selectionEndLine}:C${input.context.selectionEndColumn}`
      : ""

  return `<teaching_workspace>\nSession: ${input.context.sessionID}\nLesson file: ${input.context.lessonFilePath}\nCheckpoint file: ${input.context.checkpointFilePath}\nLanguage: ${input.context.language}\nRevision: ${input.context.revision}${checkpointStatus}${trackedFiles}${selection}\nTreat the lesson file as the shared teaching surface when editor tools are available.\n</teaching_workspace>`
}

async function getCheckpointStatus(directory: string, sessionID: string) {
  const { TeachingService } = await import("../capabilities/lesson-workspace/service/operations")
  return TeachingService.status(directory, sessionID).catch(() => undefined)
}

async function buildBuddyRuntimeContext(
  input: BuddyPromptBuildContext,
): Promise<BuddyRuntimeContextBuild> {
  const workspaceState: WorkspaceState = input.teachingContext?.active ? "interactive" : "chat"
  const profile: RuntimePromptProfile = {
    persona: input.persona,
    capabilityEnvelope: input.capabilityEnvelope,
  }
  const hasEditor = profile.capabilityEnvelope.visibleSurfaces.includes("editor")
  const teachingContext = input.teachingContext
  const learnerSections = buildLearnerContextSections(input.learnerSnapshot)

  const checkpointStatusPromise =
    input.teachingContext?.active && hasEditor
      ? getCheckpointStatus(input.directory, input.teachingContext.sessionID)
      : Promise.resolve(undefined)

  const checkpointStatus = await checkpointStatusPromise

  const runtimeSections: string[] = []

  runtimeSections.push(buildWorkspaceStateText(profile, workspaceState))
  const modelRuntime = buildModelRuntimeText(input.model)
  if (modelRuntime) {
    runtimeSections.push(modelRuntime)
  }
  const calculatorRuntime = buildCalculatorRuntimeText(profile)
  if (calculatorRuntime) {
    runtimeSections.push(calculatorRuntime)
  }
  runtimeSections.push(buildResourceContextText(input.resources))
  const activeResource = buildActiveResourceContextText(input.activeResource)
  if (activeResource) {
    runtimeSections.push(activeResource)
  }
  runtimeSections.push(learnerSections.learnerSummary)
  runtimeSections.push(learnerSections.learnerProgress)
  runtimeSections.push(learnerSections.learnerFeedback)
  if (hasEditor) {
    runtimeSections.push(TEACHING_WORKSPACE_POLICY)
  }

  if (teachingContext?.active && hasEditor) {
    runtimeSections.push(
      buildTeachingWorkspaceText({
        context: teachingContext,
        checkpointStatus,
      }),
    )
  }

  return {
    runtimeContext: `<buddy_runtime_context>\n\n${runtimeSections.join("\n\n")}\n\n</buddy_runtime_context>`,
    changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
  }
}

export async function buildBuddySystemContext(
  input: BuddyPromptBuildContext,
): Promise<BuddySystemContextBuild> {
  const runtimeContext = await buildBuddyRuntimeContext(input)
  const intentSection = `<student_intent>\n${getIntentPrompt(input.intent)}\n</student_intent>`

  return {
    systemContext: [intentSection, runtimeContext.runtimeContext].filter(Boolean).join("\n\n"),
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
  }
}
