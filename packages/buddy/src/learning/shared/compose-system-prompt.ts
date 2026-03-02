import type { TeachingPromptContext } from "../teaching/types.js"
import { CurriculumService } from "../curriculum/service.js"
import { loadLearningCompanionPrompt, condenseCurriculum } from "../companion/system-context.js"
import { TeachingService } from "../teaching/service.js"

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
  const parts = [
    "<teaching_policy>",
    "The learner must stay on the current exercise until their work has been verified and accepted.",
    "Do not treat a short status message such as 'done' or 'ready' as proof that the exercise is correct.",
    "Before advancing, read the lesson file and verify it satisfies the current exercise requirements.",
    "If a deterministic checker exists for the exercise, use it as the source of truth. Otherwise verify conservatively from the lesson file and do not advance when uncertain.",
    "If the work is incomplete or incorrect, keep the learner on the same lesson, explain the exact gap, and ask for one concrete fix.",
    "Only after the current exercise is verified should you accept it and move forward.",
    "If the lesson needs an additional source file, create it with teaching_add_file before editing it.",
    "When you need to replace the whole lesson scaffold or move to a new exercise, use the teaching_set_lesson tool so the editor file and checkpoint stay synchronized.",
    "Do not replace the entire lesson file with a raw write when teaching_set_lesson is the appropriate tool.",
    "Answer conceptual questions in chat when possible. Do not rewrite the teaching workspace or curriculum unless the learner explicitly wants a new hands-on exercise in the editor.",
    "If the learner asks to switch topics or languages mid-exercise, confirm the switch instead of silently replacing the current exercise.",
  ]

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
  const includeBehavior = input.agentName !== "code-teacher"
  const behavior = includeBehavior ? loadLearningCompanionPrompt().trim() : ""
  if (behavior) {
    parts.push(behavior)
  }

  const curriculum = await CurriculumService.peek(input.directory).catch(() => undefined)
  if (curriculum?.markdown) {
    const condensed = condenseCurriculum(curriculum.markdown).trim()
    if (condensed) {
      parts.push(["<curriculum>", `Path: ${curriculum.path}`, condensed, "</curriculum>"].join("\n"))
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
