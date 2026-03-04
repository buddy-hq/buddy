import type { TeachingPromptContext } from "../teaching/types.js"
import { CurriculumService } from "../curriculum/service.js"
import { condenseCurriculum } from "../companion/system-context.js"
import { formatLearningGoalsForSystemPrompt, listActiveGoalSets, readGoalsV1File } from "../goals/goals-v1.js"
import { TeachingService } from "../teaching/service.js"
import { getBuddyMode } from "../../modes/catalog.js"
import { isBuddyModeID } from "../../modes/types.js"
import RAW_TEACHING_POLICY_PROMPT from "../teaching/teaching-policy.p.md"

function isCompletionClaim(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return /^(done|finished|complete|completed|ready|next|go ahead|go on|move on|continue)\b/.test(normalized)
}

function formatSessionMode(input: {
  mode: "chat" | "interactive"
  sessionProfile: "general" | "workspace" | "figure"
}): string {
  const { mode, sessionProfile } = input

  if (sessionProfile === "figure") {
    return [
      "<session_mode>",
      `Mode: ${mode}`,
      mode === "interactive"
        ? "An interactive workspace is active for this session, but this mode teaches through normal chat. Do not rely on the editor workspace or teaching workspace mutation tools. Inline figure rendering is available via render_figure and render_freeform_figure."
        : "Teach through normal chat. Inline figure rendering is available via render_figure and render_freeform_figure when a diagram will materially improve the explanation. Do not rely on interactive workspace tools.",
      "</session_mode>",
    ].join("\n")
  }

  if (sessionProfile === "workspace") {
    return [
      "<session_mode>",
      `Mode: ${mode}`,
      mode === "interactive"
        ? "An interactive workspace is active for this session. Teaching workspace tools are now available: teaching_start_lesson, teaching_add_file, teaching_checkpoint, teaching_set_lesson, teaching_restore_checkpoint."
        : "No interactive workspace is active. Teach through normal chat unless the learner explicitly wants a hands-on editor lesson. If they do, use teaching_start_lesson to create the workspace first, then switch into editor-based teaching.",
      "</session_mode>",
    ].join("\n")
  }

  return [
    "<session_mode>",
    `Mode: ${mode}`,
    mode === "interactive"
      ? "An interactive workspace is active for this session. The editor context is available, but teaching workspace mutation tools are reserved for Buddy's code-buddy mode."
      : "No interactive workspace is active. Teach through normal chat. If the learner wants a hands-on editor lesson, ask them to switch to Buddy's code-buddy mode or start it from the Editor tab.",
    "</session_mode>",
  ].join("\n")
}

function formatTeachingPromptContext(
  input: TeachingPromptContext & {
    changedSinceCheckpoint?: boolean
    trackedFiles?: string[]
  },
): string {
  const parts = [
    "<teaching_workspace>",
    `Session: ${input.sessionID}`,
    `Lesson file: ${input.lessonFilePath}`,
    `Checkpoint file: ${input.checkpointFilePath}`,
    `Language: ${input.language}`,
    `Revision: ${input.revision}`,
  ]

  if (typeof input.changedSinceCheckpoint === "boolean") {
    parts.push(`Checkpoint status: ${input.changedSinceCheckpoint ? "pending acceptance" : "accepted"}`)
  }

  if (input.trackedFiles && input.trackedFiles.length > 0) {
    parts.push("Tracked files:")
    for (const file of input.trackedFiles) {
      parts.push(`- ${file}`)
    }
  }

  if (
    input.selectionStartLine &&
    input.selectionStartColumn &&
    input.selectionEndLine &&
    input.selectionEndColumn
  ) {
    parts.push(
      `Selection: L${input.selectionStartLine}:C${input.selectionStartColumn}-L${input.selectionEndLine}:C${input.selectionEndColumn}`,
    )
  }

  parts.push(
    "The lesson file is the in-app editor surface. Prefer reading and editing that file directly when guiding the learner.",
  )
  parts.push("</teaching_workspace>")
  return parts.join("\n")
}

function formatTeachingPolicy(input: { completionClaim: boolean; changedSinceCheckpoint?: boolean }): string {
  const parts = RAW_TEACHING_POLICY_PROMPT.trim()
    .replace(/\n<\/teaching_policy>\s*$/u, "")
    .split("\n")

  if (input.changedSinceCheckpoint === true) {
    parts.push("There are unaccepted changes since the last teaching checkpoint. The current exercise has not been accepted yet.")
  }

  if (input.completionClaim) {
    parts.push("The learner's latest message is only a completion claim. It is a request to verify the current exercise, not permission to advance automatically.")
  }

  parts.push("</teaching_policy>")
  return parts.join("\n")
}

export async function composeLearningSystemPrompt(input: {
  directory: string
  modeID?: string
  teachingContext?: TeachingPromptContext
  userContent?: string
}): Promise<string> {
  const mode =
    input.modeID && isBuddyModeID(input.modeID)
      ? getBuddyMode(input.modeID)
      : getBuddyMode("buddy")
  const parts: string[] = []

  if (mode.behavior.attachCurriculum) {
    const goalsFile = await readGoalsV1File(input.directory).catch(() => undefined)
    const activeGoalSets = goalsFile ? listActiveGoalSets(goalsFile.data) : []
    if (activeGoalSets.length > 0) {
      const rendered = formatLearningGoalsForSystemPrompt({
        file: goalsFile!.data,
        maxSets: 2,
        maxGoals: 10,
      }).trim()
      if (rendered) {
        parts.push(rendered)
      }
    } else {
      const curriculum = await CurriculumService.peek(input.directory).catch(() => undefined)
      if (curriculum?.markdown) {
        const condensed = condenseCurriculum(curriculum.markdown).trim()
        if (condensed) {
          parts.push(["<curriculum>", `Path: ${curriculum.path}`, condensed, "</curriculum>"].join("\n"))
        }
      }
    }
  }

  parts.push(
    formatSessionMode({
      mode: input.teachingContext?.active ? "interactive" : "chat",
      sessionProfile: mode.behavior.sessionProfile,
    }),
  )

  if (input.teachingContext?.active && mode.behavior.attachTeachingWorkspace) {
    const checkpointStatus = await TeachingService.status(input.directory, input.teachingContext.sessionID).catch(
      () => undefined,
    )

    parts.push(
      formatTeachingPromptContext({
        ...input.teachingContext,
        changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
        trackedFiles: checkpointStatus?.trackedFiles,
      }),
    )

    if (mode.behavior.attachTeachingPolicy) {
      const completionClaim = isCompletionClaim(input.userContent ?? "")
      parts.push(
        formatTeachingPolicy({
          completionClaim,
          changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
        }),
      )
    }
  }

  return parts.join("\n\n").trim()
}
