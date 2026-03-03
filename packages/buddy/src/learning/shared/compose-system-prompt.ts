import type { TeachingPromptContext } from "../teaching/types.js"
import { CurriculumService } from "../curriculum/service.js"
import { loadLearningCompanionPrompt, condenseCurriculum } from "../companion/system-context.js"
import { formatLearningGoalsForSystemPrompt, listActiveGoalSets, readGoalsV1File } from "../goals/goals-v1.js"
import { GOAL_WRITER_AGENT_NAME } from "../goals/types.js"
import { TeachingService } from "../teaching/service.js"
import TEACHING_POLICY_PROMPT from "../teaching/policy.md"

function isCompletionClaim(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return /^(done|finished|complete|completed|ready|next|go ahead|go on|move on|continue)\b/.test(normalized)
}

function formatSessionMode(input: {
  mode: "chat" | "interactive"
  teachingToolsAvailable: boolean
}): string {
  const { mode, teachingToolsAvailable } = input
  return [
    "<session_mode>",
    `Mode: ${mode}`,
    mode === "interactive"
      ? teachingToolsAvailable
        ? "An interactive workspace is active for this session. Teaching workspace tools are now available: teaching_start_lesson, teaching_add_file, teaching_checkpoint, teaching_set_lesson, teaching_restore_checkpoint."
        : "An interactive workspace is active for this session. The editor context is available, but teaching workspace mutation tools are reserved for the code-teacher agent."
      : teachingToolsAvailable
        ? "No interactive workspace is active. Teach through normal chat unless the learner explicitly wants a hands-on editor lesson. If they do, use teaching_start_lesson to create the workspace first, then switch into editor-based teaching."
        : "No interactive workspace is active. Teach through normal chat. If the learner wants a hands-on editor lesson, ask them to switch to the code-teacher agent or start it from the Editor tab.",
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
  const parts = TEACHING_POLICY_PROMPT.trim()
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
  agentName?: string
  teachingContext?: TeachingPromptContext
  userContent?: string
}): Promise<string> {
  const parts: string[] = []
  const includeBehavior = input.agentName !== "code-teacher" && input.agentName !== GOAL_WRITER_AGENT_NAME
  const behavior = includeBehavior ? loadLearningCompanionPrompt().trim() : ""
  if (behavior) {
    parts.push(behavior)
  }

  if (input.agentName !== GOAL_WRITER_AGENT_NAME) {
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
      teachingToolsAvailable: input.agentName === "code-teacher",
    }),
  )

  if (input.teachingContext?.active) {
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

    if (input.agentName === "code-teacher") {
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
