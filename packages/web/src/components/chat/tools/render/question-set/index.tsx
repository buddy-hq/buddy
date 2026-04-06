import { useEffect, useState } from "react"
import { ToolOutputPanel } from "../../../tools/tool-output-panel"
import { language } from "@/context/language"
import { isRecord, readNonEmptyString } from "../../../tools/types"
import { unwrapError } from "../../../utils/error"
import { requestJson } from "@/lib/api-client"
import type { ToolPartProps } from "../../registry"
import {
  QuestionSetInlineView,
  type PublicQuestionSetArtifact,
  type SubmitQuestionSetAttemptOutput,
} from "./question-set-inline-view"
import { QuestionSetToolCard } from "./question-set-tool-card"

type RenderSavedQuestionSetOutput = {
  artifactID: string
  groupType: "quiz" | "practice" | "assessment"
  title: string
  questionCount: number
  artifact?: PublicQuestionSetArtifact
}

const questionSetArtifactRequests = new Map<string, Promise<PublicQuestionSetArtifact>>()

function parsePublicQuestionSetArtifact(value: unknown): PublicQuestionSetArtifact | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const artifactID = readNonEmptyString(value.artifactID)
  const title = readNonEmptyString(value.title)
  const groupType =
    value.groupType === "quiz" || value.groupType === "practice" || value.groupType === "assessment"
      ? value.groupType
      : undefined
  const questions = Array.isArray(value.questions) ? value.questions : undefined

  if (!artifactID || !title || !groupType || !questions) {
    return undefined
  }

  const parsedQuestions = questions
    .map((question): PublicQuestionSetArtifact["questions"][number] | undefined => {
      if (!isRecord(question)) {
        return undefined
      }

      const questionID = readNonEmptyString(question.id)
      const prompt = readNonEmptyString(question.prompt)
      const goalIds = Array.isArray(question.goalIds)
        ? question.goalIds.filter((goalId): goalId is string => typeof goalId === "string")
        : []
      const explanation = readNonEmptyString(question.explanation)
      const payload = isRecord(question.payload) ? question.payload : undefined
      const choices = Array.isArray(payload?.choices) ? payload.choices : undefined
      const multipleSelect = payload?.multipleSelect

      if (
        !payload ||
        !questionID ||
        !prompt ||
        goalIds.length === 0 ||
        !choices ||
        typeof multipleSelect !== "boolean"
      ) {
        return undefined
      }

      const parsedChoices = choices
        .map(
          (
            choice,
          ):
            | PublicQuestionSetArtifact["questions"][number]["payload"]["choices"][number]
            | undefined => {
            if (!isRecord(choice)) {
              return undefined
            }

            const choiceID = readNonEmptyString(choice.id)
            const content = readNonEmptyString(choice.content)
            if (!choiceID || !content) {
              return undefined
            }

            const parsedChoice: PublicQuestionSetArtifact["questions"][number]["payload"]["choices"][number] =
              {
                id: choiceID,
                content,
              }
            if (typeof choice.isNoneOfTheAbove === "boolean") {
              parsedChoice.isNoneOfTheAbove = choice.isNoneOfTheAbove
            }

            return parsedChoice
          },
        )
        .filter(
          (
            choice,
          ): choice is PublicQuestionSetArtifact["questions"][number]["payload"]["choices"][number] =>
            choice !== undefined,
        )

      if (parsedChoices.length < 2) {
        return undefined
      }

      const parsedPayload: PublicQuestionSetArtifact["questions"][number]["payload"] = {
        multipleSelect,
        choices: parsedChoices,
      }
      if (typeof payload.countChoices === "boolean") {
        parsedPayload.countChoices = payload.countChoices
      }
      if (typeof payload.numCorrect === "number") {
        parsedPayload.numCorrect = payload.numCorrect
      }
      if (typeof payload.hasNoneOfTheAbove === "boolean") {
        parsedPayload.hasNoneOfTheAbove = payload.hasNoneOfTheAbove
      }
      if (typeof payload.randomize === "boolean") {
        parsedPayload.randomize = payload.randomize
      }

      const parsedQuestion: PublicQuestionSetArtifact["questions"][number] = {
        id: questionID,
        prompt,
        goalIds,
        payload: parsedPayload,
      }
      if (explanation) {
        parsedQuestion.explanation = explanation
      }

      return parsedQuestion
    })
    .filter(
      (question): question is PublicQuestionSetArtifact["questions"][number] =>
        question !== undefined,
    )

  if (parsedQuestions.length === 0) {
    return undefined
  }

  return {
    artifactID,
    title,
    groupType,
    questions: parsedQuestions,
  }
}

function parseRenderSavedQuestionSetOutput(
  state: ToolPartProps["state"],
): RenderSavedQuestionSetOutput | undefined {
  if (readNonEmptyString(state.metadata.artifact) !== "RenderSavedQuestionSetOutput") {
    return undefined
  }

  const value = isRecord(state.metadata.value) ? state.metadata.value : undefined
  if (!value) {
    return undefined
  }

  const artifactID = readNonEmptyString(value.artifactID)
  const title = readNonEmptyString(value.title)
  const groupType =
    value.groupType === "quiz" || value.groupType === "practice" || value.groupType === "assessment"
      ? value.groupType
      : undefined
  const questionCount = typeof value.questionCount === "number" ? value.questionCount : undefined

  if (!artifactID || !title || !groupType || questionCount === undefined) {
    return undefined
  }

  return {
    artifactID,
    title,
    groupType,
    questionCount,
    artifact: parsePublicQuestionSetArtifact(value.artifact),
  }
}

async function fetchQuestionSetArtifact(
  directory: string,
  artifactID: string,
): Promise<PublicQuestionSetArtifact> {
  const cacheKey = `${directory}:${artifactID}`
  const existing = questionSetArtifactRequests.get(cacheKey)
  if (existing) {
    return existing
  }
  // TODO: Use getBuddyClient(directory).questionSetArtifacts.read() instead of manual fetch
  const request = requestJson<PublicQuestionSetArtifact>(
    directory,
    `/api/question-set-artifacts/${artifactID}`,
  ).finally(() => {
    questionSetArtifactRequests.delete(cacheKey)
  })

  questionSetArtifactRequests.set(cacheKey, request)
  return request
}

function RenderSavedQuestionSetToolCard({ state, info, directory }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0
  const parsed = state.status === "completed" ? parseRenderSavedQuestionSetOutput(state) : undefined
  const parsedArtifactID = parsed?.artifactID
  const parsedEmbeddedArtifact = parsed?.artifact

  const [artifact, setArtifact] = useState<PublicQuestionSetArtifact | undefined>(
    parsedEmbeddedArtifact,
  )
  const [loadError, setLoadError] = useState<string | undefined>(undefined)

  useEffect(() => {
    setArtifact(parsedEmbeddedArtifact)
    setLoadError(undefined)
  }, [parsedArtifactID, parsedEmbeddedArtifact])

  useEffect(() => {
    if (!parsedArtifactID || parsedEmbeddedArtifact) {
      return
    }
    if (artifact?.artifactID === parsedArtifactID) {
      return
    }
    if (!directory) {
      setLoadError(language.t("chatTools.questionSetNoWorkspaceDirectory"))
      return
    }

    let cancelled = false
    void fetchQuestionSetArtifact(directory, parsedArtifactID)
      .then((fetchedArtifact) => {
        if (cancelled) {
          return
        }
        setArtifact(fetchedArtifact)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setLoadError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [artifact?.artifactID, directory, parsedArtifactID, parsedEmbeddedArtifact])

  if (running) {
    return (
      <QuestionSetToolCard title={info.title} subtitle={info.subtitle} status={state.status}>
        <div className="text-sm text-text-weak">Preparing question set...</div>
      </QuestionSetToolCard>
    )
  }

  if (!parsed) {
    return (
      <QuestionSetToolCard title={info.title} subtitle={info.subtitle} status={state.status}>
        {showOutput ? (
          <ToolOutputPanel
            output={output}
            status={state.status}
            copyLabel={language.t("chatTools.copyOutput")}
          />
        ) : null}
      </QuestionSetToolCard>
    )
  }

  return (
    <QuestionSetToolCard
      title={parsed.title}
      subtitle={`${parsed.groupType} • ${questionCountLabel(parsed.questionCount)}`}
      status={state.status}
    >
      {artifact ? (
        <QuestionSetInlineView
          artifact={artifact}
          onSubmit={async (answers) => {
            if (!directory) {
              throw new Error(language.t("chatTools.questionSetNoWorkspaceDirectory"))
            }
            const response = await requestJson<SubmitQuestionSetAttemptOutput>(
              directory,
              `/api/question-set-artifacts/${artifact.artifactID}/attempts`,
              {
                method: "POST",
                body: {
                  answers: artifact.questions.map((question) => ({
                    questionID: question.id,
                    selectedChoiceIds: answers[question.id] ?? [],
                  })),
                },
              },
            )
            return response.result
          }}
        />
      ) : (
        <div className="text-sm text-text-weak">Loading question set...</div>
      )}
      {loadError ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {loadError}
        </p>
      ) : null}
    </QuestionSetToolCard>
  )
}

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

export function renderRenderSavedQuestionSetTool(props: ToolPartProps) {
  return <RenderSavedQuestionSetToolCard {...props} />
}
