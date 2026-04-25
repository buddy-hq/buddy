import { useEffect, useState } from "react"
import { ToolOutputPanel } from "../../../tools/tool-output-panel"
import { ToolErrorPanel } from "../../../tools/tool-error-panel"
import type { ToolPartProps } from "../../registry"
import { isRecord, readNonEmptyString, readNonNegativeInt } from "../../../tools/types"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
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
      const multipleSelect =
        payload?.multipleSelect === true
          ? true
          : payload?.multipleSelect === false
            ? false
            : undefined
      const choices = Array.isArray(payload?.choices) ? payload.choices : undefined

      if (!questionID || !prompt || !payload || multipleSelect === undefined || !choices) {
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

            return {
              id: choiceID,
              content,
              ...(choice.isNoneOfTheAbove === true ? { isNoneOfTheAbove: true } : {}),
            }
          },
        )
        .filter(
          (
            choice,
          ): choice is PublicQuestionSetArtifact["questions"][number]["payload"]["choices"][number] =>
            choice !== undefined,
        )

      if (parsedChoices.length === 0) {
        return undefined
      }

      return {
        id: questionID,
        prompt,
        goalIds,
        ...(explanation ? { explanation } : {}),
        payload: {
          multipleSelect,
          ...(payload.countChoices === true ? { countChoices: true } : {}),
          ...(typeof payload.numCorrect === "number" ? { numCorrect: payload.numCorrect } : {}),
          ...(payload.hasNoneOfTheAbove === true ? { hasNoneOfTheAbove: true } : {}),
          ...(payload.randomize === true ? { randomize: true } : {}),
          choices: parsedChoices,
        },
      }
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
  const questionCount = readNonNegativeInt(value.questionCount)

  if (!artifactID || !title || !groupType || questionCount === undefined) {
    return undefined
  }

  return {
    artifactID,
    groupType,
    title,
    questionCount,
    artifact: parsePublicQuestionSetArtifact(value.artifact),
  }
}

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

function fetchQuestionSetArtifact(
  directory: string,
  artifactID: string,
): Promise<PublicQuestionSetArtifact> {
  const cacheKey = `${directory}:${artifactID}`
  const existing = questionSetArtifactRequests.get(cacheKey)
  if (existing) {
    return existing
  }

  const request = getBuddyClient(directory)
    .questionSetArtifacts.read({
      artifactID,
    })
    .then((result) => {
      const artifact: PublicQuestionSetArtifact = requireBuddyData(result)
      return artifact
    })
    .finally(() => {
      questionSetArtifactRequests.delete(cacheKey)
    })

  questionSetArtifactRequests.set(cacheKey, request)
  return request
}

export function renderSavedQuestionSetTool(props: ToolPartProps) {
  const directory = props.directory
  const running = props.state.status === "pending" || props.state.status === "running"
  const output = props.state.output || (props.state.error ?? "")
  const showOutput = output.trim().length > 0
  const parsed =
    props.state.status === "completed" ? parseRenderSavedQuestionSetOutput(props.state) : undefined
  const artifactID = parsed?.artifactID
  const parsedArtifact = parsed?.artifact
  const artifactKey = directory && artifactID ? `${directory}:${artifactID}` : artifactID
  const [artifact, setArtifact] = useState<PublicQuestionSetArtifact | undefined>(parsed?.artifact)
  const [loadedKey, setLoadedKey] = useState<string | undefined>(
    parsed?.artifact && artifactKey ? artifactKey : undefined,
  )
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const visibleArtifact = loadedKey === artifactKey ? artifact : undefined

  useEffect(() => {
    setArtifact(parsedArtifact)
    setLoadedKey(parsedArtifact && artifactKey ? artifactKey : undefined)
    setLoadError(undefined)
  }, [artifactKey, parsedArtifact])

  useEffect(() => {
    if (!artifactID || parsedArtifact || loadedKey === artifactKey) {
      return
    }
    if (!directory) {
      setLoadError(language.t("chatTools.questionSetNoWorkspaceDirectory"))
      return
    }

    let cancelled = false
    void fetchQuestionSetArtifact(directory, artifactID)
      .then((fetchedArtifact) => {
        if (!cancelled) {
          setArtifact(fetchedArtifact)
          setLoadedKey(artifactKey)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(stringifyError(error))
        }
      })

    return () => {
      cancelled = true
    }
  }, [artifactID, artifactKey, directory, loadedKey, parsedArtifact])

  if (running) {
    return (
      <QuestionSetToolCard
        title={props.info.title}
        subtitle={props.info.subtitle}
        status={props.state.status}
      >
        <div className="text-sm text-text-weak">Preparing question set...</div>
      </QuestionSetToolCard>
    )
  }

  if (!parsed) {
    return (
      <QuestionSetToolCard
        title={props.info.title}
        subtitle={props.info.subtitle}
        status={props.state.status}
      >
        {showOutput ? (
          <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyOutput")} />
        ) : null}
      </QuestionSetToolCard>
    )
  }

  return (
    <QuestionSetToolCard
      title={parsed.title}
      subtitle={`${parsed.groupType} • ${questionCountLabel(parsed.questionCount)}`}
      status={props.state.status}
    >
      {visibleArtifact && directory ? (
        <QuestionSetInlineView
          artifact={visibleArtifact}
          onSubmit={async (answers) => {
            const response: SubmitQuestionSetAttemptOutput = requireBuddyData(
              await getBuddyClient(directory).questionSetArtifacts.submitAttempt({
                artifactID: visibleArtifact.artifactID,
                answers: visibleArtifact.questions.map((question) => ({
                  questionID: question.id,
                  selectedChoiceIds: answers[question.id] ?? [],
                })),
              }),
            )

            return response.result
          }}
        />
      ) : (
        <div className="text-sm text-text-weak">Loading question set...</div>
      )}
      {loadError ? <ToolErrorPanel error={loadError} /> : null}
    </QuestionSetToolCard>
  )
}
