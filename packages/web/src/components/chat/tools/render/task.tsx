import type { ToolPartProps } from "../registry"
import { TaskToolCard } from "./task/task-tool-card"
import { FlashcardAuthorTaskCard } from "./task/flashcard-author-task-card"
import { QuestionSetAuthorTaskCard } from "./task/question-set-author-task-card"
import { FLASHCARD_AUTHOR_SUBAGENT, QUESTION_SET_AUTHOR_SUBAGENT } from "./task/task-utils"
import { readString } from "../types"

export function renderTaskTool({ state, onOpenSession, directory }: ToolPartProps) {
  const configuredSubagent = readString(state.input.subagent_type)
  if (configuredSubagent === FLASHCARD_AUTHOR_SUBAGENT) {
    return (
      <FlashcardAuthorTaskCard state={state} onOpenSession={onOpenSession} directory={directory} />
    )
  }
  if (configuredSubagent === QUESTION_SET_AUTHOR_SUBAGENT) {
    return (
      <QuestionSetAuthorTaskCard
        state={state}
        onOpenSession={onOpenSession}
        directory={directory}
      />
    )
  }

  return <TaskToolCard state={state} onOpenSession={onOpenSession} directory={directory} />
}
