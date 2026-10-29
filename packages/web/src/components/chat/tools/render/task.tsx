import type { ToolPartProps } from "../registry"
import { readPartSubagent } from "@/lib/running-subagents"
import { TaskToolCard } from "./task/task-tool-card"
import { FlashcardAuthorTaskCard } from "./task/flashcard-author-task-card"
import { QuestionSetAuthorTaskCard } from "./task/question-set-author-task-card"
import { FLASHCARD_AUTHOR_SUBAGENT, QUESTION_SET_AUTHOR_SUBAGENT } from "./task/task-utils"

export function renderSubagentTool({ part, state, onOpenSession, directory }: ToolPartProps) {
  const subagent = readPartSubagent(part)
  if (subagent?.agentID === FLASHCARD_AUTHOR_SUBAGENT) {
    return (
      <FlashcardAuthorTaskCard
        subagent={subagent}
        state={state}
        onOpenSession={onOpenSession}
        directory={directory}
      />
    )
  }
  if (subagent?.agentID === QUESTION_SET_AUTHOR_SUBAGENT) {
    return (
      <QuestionSetAuthorTaskCard
        subagent={subagent}
        state={state}
        onOpenSession={onOpenSession}
        directory={directory}
      />
    )
  }

  return (
    <TaskToolCard subagent={subagent} state={state} onOpenSession={onOpenSession} directory={directory} />
  )
}
