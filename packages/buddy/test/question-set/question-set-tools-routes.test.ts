import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index.ts"
import { SaveQuestionSetOutputSchema } from "../../src/learning/features/question-sets/types"
import type { SaveQuestionSetInput } from "../../src/learning/features/question-sets/tools/save-question-set"
import { ensureQuestionSetToolsRegistered } from "../../src/learning/features/question-sets/tools/register"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

function sampleQuestionSetInput(): SaveQuestionSetInput {
  return {
    groupType: "quiz",
    title: "Intro Algebra Check",
    instructions: "Choose the best answer for each question.",
    questions: [
      {
        id: "q1",
        type: "mcq",
        prompt: "What is 2 + 2?",
        goalIds: ["goal-algebra-basics"],
        payload: {
          multipleSelect: false,
          choices: [
            { id: "q1-a", content: "3", correct: false, rationale: "Too low." },
            { id: "q1-b", content: "4", correct: true, rationale: "Correct sum." },
            { id: "q1-c", content: "5", correct: false, rationale: "Too high." },
          ],
        },
      },
      {
        id: "q2",
        type: "mcq",
        prompt: "Select all prime numbers.",
        goalIds: ["goal-primes"],
        explanation: "Prime numbers are divisible only by 1 and themselves.",
        payload: {
          multipleSelect: true,
          countChoices: true,
          numCorrect: 2,
          hasNoneOfTheAbove: true,
          choices: [
            { id: "q2-a", content: "2", correct: true, rationale: "Prime." },
            { id: "q2-b", content: "3", correct: true, rationale: "Prime." },
            { id: "q2-c", content: "4", correct: false, rationale: "Divisible by 2." },
            {
              id: "q2-none",
              content: "None of the above",
              correct: false,
              rationale: "At least two answers are prime.",
              isNoneOfTheAbove: true,
            },
          ],
        },
      },
    ],
  }
}

describe("question-set tools and routes", () => {
  test("rejects saving question sets where none-of-the-above is correct with another choice", async () => {
    await using project = await tmpdir({ git: true })

    const invalidInput = sampleQuestionSetInput()
    const targetQuestion = invalidInput.questions.find((question) => question.id === "q2")
    expect(targetQuestion).toBeDefined()
    if (!targetQuestion) {
      return
    }

    targetQuestion.payload.numCorrect = 2
    for (const choice of targetQuestion.payload.choices) {
      if (choice.id === "q2-none") {
        choice.correct = true
      } else if (choice.id === "q2-b") {
        choice.correct = false
      }
    }

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureQuestionSetToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveQuestionSet = requireTool(tools, "save_question_set")

        await expect(
          saveQuestionSet.execute(
            invalidInput,
            createToolContext({
              sessionID: "ses_invalid_none_correct",
              messageID: "msg_invalid_none_correct",
              agent: "question-set-author",
            }),
          ),
        ).rejects.toThrow(
          "cannot mark 'none of the above' as correct alongside other correct choices",
        )
      },
    })
  })

  test("saves answerful question sets and exposes public answerless artifacts with provenance", async () => {
    await using project = await tmpdir({ git: true })

    const saveOutput = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureQuestionSetToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveQuestionSet = requireTool(tools, "save_question_set")
        return SaveQuestionSetOutputSchema.parse(
          JSON.parse(
            (
              await saveQuestionSet.execute(
                sampleQuestionSetInput(),
                createToolContext({
                  sessionID: "ses_question_set",
                  messageID: "msg_question_set",
                  agent: "question-set-author",
                }),
              )
            ).output,
          ),
        )
      },
    })

    const artifactFile = path.join(
      project.path,
      ".buddy",
      "question-set-artifacts",
      saveOutput.artifactID,
      "artifact.json",
    )
    const savedArtifactText = await fs.readFile(artifactFile, "utf8")
    const savedArtifact = JSON.parse(savedArtifactText) as {
      questions: Array<{
        payload: {
          choices: Array<{ correct?: boolean; rationale?: string }>
        }
      }>
    }

    const readResponse = await app.request(
      `/api/question-set-artifacts/${saveOutput.artifactID}?directory=${encodeURIComponent(project.path)}`,
    )
    expect(readResponse.status).toBe(200)
    const publicArtifact = (await readResponse.json()) as {
      artifactID: string
      createdBy: {
        sessionID: string
        messageID: string
        callID: string
        subagent: string
      }
      questions: Array<{
        payload: {
          choices: Array<{ correct?: boolean; rationale?: string }>
        }
      }>
    }
    expect(publicArtifact.artifactID).toBe(saveOutput.artifactID)
    expect(publicArtifact.questions).toHaveLength(2)
    expect("correct" in publicArtifact.questions[0]!.payload.choices[0]!).toBe(false)
    expect("rationale" in publicArtifact.questions[0]!.payload.choices[0]!).toBe(false)
    expect(publicArtifact.createdBy.sessionID).toBe("ses_question_set")
    expect(publicArtifact.createdBy.messageID).toBe("msg_question_set")
    expect(publicArtifact.createdBy.callID).toBeDefined()
    expect(publicArtifact.createdBy.subagent).toBe("question-set-author")

    const listResponse = await app.request(
      `/api/question-set-artifacts?directory=${encodeURIComponent(project.path)}`,
    )
    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as {
      artifacts: Array<{
        artifactID: string
        createdBy: {
          sessionID: string
          messageID: string
          callID: string
          subagent: string
        }
      }>
    }
    expect(listBody.artifacts).toHaveLength(1)
    expect(listBody.artifacts[0]?.artifactID).toBe(saveOutput.artifactID)
    expect(listBody.artifacts[0]?.createdBy.sessionID).toBe("ses_question_set")

    expect(savedArtifact.questions[0]!.payload.choices[0]!.correct).toBeDefined()
    expect(savedArtifact.questions[0]!.payload.choices[0]!.rationale).toBeDefined()
  })

  test("grades submitted attempts and persists attempt records", async () => {
    await using project = await tmpdir({ git: true })

    const saveOutput = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureQuestionSetToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveQuestionSet = requireTool(tools, "save_question_set")
        const result = await saveQuestionSet.execute(
          sampleQuestionSetInput(),
          createToolContext({
            sessionID: "ses_grade",
            messageID: "msg_grade",
            agent: "question-set-author",
          }),
        )
        return SaveQuestionSetOutputSchema.parse(JSON.parse(result.output))
      },
    })

    const response = await app.request(
      `/api/question-set-artifacts/${saveOutput.artifactID}/attempts?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          answers: [
            { questionID: "q1", selectedChoiceIds: ["q1-a"] },
            { questionID: "q2", selectedChoiceIds: ["q2-a", "q2-b"] },
          ],
        }),
      },
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      attemptID: string
      artifactID: string
      result: {
        totalQuestions: number
        correctQuestions: number
        status: string
        questions: Array<{
          questionID: string
          choices: Array<{ rationale?: string }>
        }>
      }
    }

    expect(body.artifactID).toBe(saveOutput.artifactID)
    expect(body.result.totalQuestions).toBe(2)
    expect(body.result.correctQuestions).toBe(1)
    expect(body.result.status).toBe("completed")
    expect(body.result.questions[0]?.questionID).toBe("q1")
    expect(body.result.questions[0]?.choices.some((choice) => !!choice.rationale)).toBe(true)

    const attemptFile = path.join(
      project.path,
      ".buddy",
      "question-set-artifacts",
      saveOutput.artifactID,
      "attempts",
      `${body.attemptID}.json`,
    )
    const attemptText = await fs.readFile(attemptFile, "utf8")
    expect(attemptText).toContain(`"artifactID": "${saveOutput.artifactID}"`)
  })

  test("rejects invalid submitted choice ids and none-of-the-above exclusivity violations", async () => {
    await using project = await tmpdir({ git: true })

    const saveOutput = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureQuestionSetToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveQuestionSet = requireTool(tools, "save_question_set")
        const result = await saveQuestionSet.execute(
          sampleQuestionSetInput(),
          createToolContext({
            sessionID: "ses_invalid_attempt",
            messageID: "msg_invalid_attempt",
            agent: "question-set-author",
          }),
        )
        return SaveQuestionSetOutputSchema.parse(JSON.parse(result.output))
      },
    })

    const invalidChoiceResponse = await app.request(
      `/api/question-set-artifacts/${saveOutput.artifactID}/attempts?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: [{ questionID: "q1", selectedChoiceIds: ["does-not-exist"] }],
        }),
      },
    )
    expect(invalidChoiceResponse.status).toBe(400)

    const unknownQuestionIDResponse = await app.request(
      `/api/question-set-artifacts/${saveOutput.artifactID}/attempts?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: [{ questionID: "q999", selectedChoiceIds: [] }],
        }),
      },
    )
    expect(unknownQuestionIDResponse.status).toBe(400)

    const invalidNoneOfTheAboveResponse = await app.request(
      `/api/question-set-artifacts/${saveOutput.artifactID}/attempts?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: [{ questionID: "q2", selectedChoiceIds: ["q2-none", "q2-a"] }],
        }),
      },
    )
    expect(invalidNoneOfTheAboveResponse.status).toBe(400)
  })
})
