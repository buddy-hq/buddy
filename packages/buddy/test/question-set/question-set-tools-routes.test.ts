import { describe, expect, setDefaultTimeout, test } from "bun:test"
import fs from "node:fs/promises"
import z from "zod"
import { app } from "../../src/index.ts"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  BuddyObjectResultSchema,
  generateObjectID,
  type BuddyObjectRef,
  type BuddyObjectResult,
} from "../../src/objects"
import {
  QuestionSetObjectPayloadSchema,
  PublicQuestionSetObjectReadSchema,
  saveQuestionSetObject,
} from "../../src/learning/features/question-sets/storage/save-object"
import type { SavedQuestionSetObject } from "../../src/learning/features/question-sets/types"
import {
  saveQuestionSetTool,
  type SaveQuestionSetInput,
} from "../../src/learning/features/question-sets/tools/save-question-set"
import { tmpdir } from "../helpers/tmpdir"
import { createBuddyToolContext } from "../helpers/tools"

const QUESTION_SET_FILE_NAME = "question-set.json"
const APP_BACKED_TOOL_TEST_TIMEOUT_MS = 20_000

setDefaultTimeout(APP_BACKED_TOOL_TEST_TIMEOUT_MS)

const ObjectListBodySchema = z
  .object({
    objects: z.array(
      z
        .object({
          objectID: z.string(),
          kind: z.literal(BUDDY_OBJECT_KINDS.questionSet),
          title: z.string(),
        })
        .passthrough(),
    ),
    loadErrors: z.array(
      z
        .object({
          objectID: z.string().nullable(),
          kind: z.string().nullable(),
          message: z.string(),
        })
        .passthrough(),
    ),
  })
  .strict()

const AttemptResponseSchema = z
  .object({
    attemptID: z.string(),
    objectID: z.string(),
    result: z
      .object({
        totalQuestions: z.number(),
        correctQuestions: z.number(),
        status: z.string(),
        questions: z.array(
          z
            .object({
              questionID: z.string(),
              choices: z.array(z.object({ rationale: z.string().optional() }).passthrough()),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .strict()

function questionSetFile(directory: string, objectID: string, revisionID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.questionSet,
    objectID,
    "revisions",
    revisionID,
    QUESTION_SET_FILE_NAME,
  )
}

function questionSetAttemptFile(directory: string, objectID: string, attemptID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.questionSet,
    objectID,
    "state",
    "attempts",
    `${attemptID}.json`,
  )
}

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

function requireQuestionSetRef(result: BuddyObjectResult): BuddyObjectRef {
  const ref = result.primaryRef
  expect(ref).not.toBeNull()
  if (!ref) {
    throw new Error("Expected question-set object ref.")
  }
  expect(ref.kind).toBe(BUDDY_OBJECT_KINDS.questionSet)
  return ref
}

function requireRevisionID(ref: BuddyObjectRef): string {
  expect(ref.revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  if (!ref.revisionID) {
    throw new Error("Expected question-set revision id.")
  }
  return ref.revisionID
}

async function saveQuestionSetWithTool(directory: string, sessionID: string): Promise<{
  result: BuddyObjectResult
  ref: BuddyObjectRef
  revisionID: string
}> {
  const result = await saveQuestionSetTool.run(
    sampleQuestionSetInput(),
    createBuddyToolContext({
      directory,
      sessionID,
      messageID: `msg_${sessionID}`,
      agent: "question-set-author",
    }),
  )
  const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
  const ref = requireQuestionSetRef(objectResult)
  const revisionID = requireRevisionID(ref)
  return { result: objectResult, ref, revisionID }
}

async function createStoredQuestionSetObject(directory: string): Promise<SavedQuestionSetObject> {
  const input = sampleQuestionSetInput()
  const saved = await saveQuestionSetObject({
    directory,
    payload: {
      objectID: generateObjectID(),
      kind: BUDDY_OBJECT_KINDS.questionSet,
      groupType: input.groupType ?? "quiz",
      title: input.title,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      questions: input.questions,
      createdAt: new Date().toISOString(),
      createdBy: {
        kind: "tool",
        sessionID: "ses_storage_fixture",
        messageID: "msg_storage_fixture",
        callID: "call_storage_fixture",
        subagent: "question-set-author",
      },
    },
  })
  return saved.payload
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

    await expect(
      saveQuestionSetTool.run(
        invalidInput,
        createBuddyToolContext({
          directory: project.path,
          sessionID: "ses_invalid_none_correct",
          messageID: "msg_invalid_none_correct",
          agent: "question-set-author",
        }),
      ),
    ).rejects.toThrow(
      "cannot mark 'none of the above' as correct alongside other correct choices",
    )
  })

  test("saves answerful question sets and exposes public answerless objects with provenance", async () => {
    await using project = await tmpdir({ git: true })
    const saved = await saveQuestionSetWithTool(project.path, "ses_question_set")

    const payloadFile = questionSetFile(project.path, saved.ref.objectID, saved.revisionID)
    const savedPayload = QuestionSetObjectPayloadSchema.parse(
      JSON.parse(await fs.readFile(payloadFile, "utf8")),
    )

    const readResponse = await app.request(
      `/api/objects/question-set/${saved.ref.objectID}/questions?directory=${encodeURIComponent(
        project.path,
      )}`,
    )
    expect(readResponse.status).toBe(200)
    const publicObject = PublicQuestionSetObjectReadSchema.parse(await readResponse.json())
    expect(publicObject.objectID).toBe(saved.ref.objectID)
    expect(publicObject.revisionID).toBe(saved.revisionID)
    expect(publicObject.questions).toHaveLength(2)
    expect("correct" in publicObject.questions[0]!.payload.choices[0]!).toBe(false)
    expect("rationale" in publicObject.questions[0]!.payload.choices[0]!).toBe(false)
    expect(publicObject.createdBy.kind).toBe("tool")
    if (publicObject.createdBy.kind !== "tool") {
      throw new Error("Expected tool origin.")
    }
    expect(publicObject.createdBy.sessionID).toBe("ses_question_set")
    expect(publicObject.createdBy.messageID).toBe("msg_ses_question_set")
    expect(publicObject.createdBy.callID).toBeDefined()
    expect(publicObject.createdBy.subagent).toBe("question-set-author")

    const presentation = saved.result.presentations.find(
      (item) => item.data?.renderer === "question-set",
    )
    expect(presentation?.data?.renderer).toBe("question-set")
    if (presentation?.data?.renderer !== "question-set") {
      throw new Error("Expected inline question-set presentation data.")
    }
    expect(presentation.data.questionSet.questions).toHaveLength(2)
    expect("correct" in presentation.data.questionSet.questions[0]!.payload.choices[0]!).toBe(
      false,
    )
    expect("rationale" in presentation.data.questionSet.questions[0]!.payload.choices[0]!).toBe(
      false,
    )

    const listResponse = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}&kind=question-set`,
    )
    expect(listResponse.status).toBe(200)
    const listBody = ObjectListBodySchema.parse(await listResponse.json())
    expect(listBody.objects).toHaveLength(1)
    expect(listBody.objects[0]?.objectID).toBe(saved.ref.objectID)

    expect(savedPayload.questions[0]!.payload.choices[0]!.content).toBe("3")
    const rawPayload = JSON.parse(await fs.readFile(payloadFile, "utf8"))
    const answerfulPayload = z
      .object({
        questions: z.array(
          z.object({
            payload: z.object({
              choices: z.array(
                z.object({
                  correct: z.boolean(),
                  rationale: z.string().optional(),
                }),
              ),
            }),
          }),
        ),
      })
      .parse(rawPayload)
    expect(answerfulPayload.questions[0]!.payload.choices[0]!.correct).toBe(false)
    expect(answerfulPayload.questions[0]!.payload.choices[0]!.rationale).toBe("Too low.")
  })

  test("keeps valid question-set objects visible while surfacing corrupt load errors", async () => {
    await using project = await tmpdir({ git: true })
    const object = await createStoredQuestionSetObject(project.path)
    const corruptObject = await createStoredQuestionSetObject(project.path)

    await fs.writeFile(
      BuddyObjectPath.manifestFile(
        project.path,
        BUDDY_OBJECT_KINDS.questionSet,
        corruptObject.objectID,
      ),
      "{",
      "utf8",
    )

    const response = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}&kind=question-set`,
    )

    expect(response.status).toBe(200)
    const body = ObjectListBodySchema.parse(await response.json())
    expect(body.objects.map((item) => item.objectID)).toEqual([object.objectID])
    expect(body.loadErrors).toHaveLength(1)
    expect(body.loadErrors[0]?.objectID).toBe(corruptObject.objectID)
    expect(body.loadErrors[0]?.message).toContain("could not be loaded")
  })

  test("grades submitted attempts and persists attempt records", async () => {
    await using project = await tmpdir({ git: true })
    const saved = await saveQuestionSetWithTool(project.path, "ses_grade")

    const response = await app.request(
      `/api/objects/question-set/${saved.ref.objectID}/attempts?directory=${encodeURIComponent(project.path)}`,
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
    const body = AttemptResponseSchema.parse(await response.json())

    expect(body.objectID).toBe(saved.ref.objectID)
    expect(body.result.totalQuestions).toBe(2)
    expect(body.result.correctQuestions).toBe(1)
    expect(body.result.status).toBe("completed")
    expect(body.result.questions[0]?.questionID).toBe("q1")
    expect(body.result.questions[0]?.choices.some((choice) => !!choice.rationale)).toBe(true)

    const attemptFile = questionSetAttemptFile(project.path, saved.ref.objectID, body.attemptID)
    const attemptText = await fs.readFile(attemptFile, "utf8")
    expect(attemptText).toContain(`"objectID": "${saved.ref.objectID}"`)
  })

  test("rejects invalid submitted choice ids and none-of-the-above exclusivity violations", async () => {
    await using project = await tmpdir({ git: true })
    const saved = await saveQuestionSetWithTool(project.path, "ses_invalid_attempt")

    const invalidChoiceResponse = await app.request(
      `/api/objects/question-set/${saved.ref.objectID}/attempts?directory=${encodeURIComponent(project.path)}`,
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
      `/api/objects/question-set/${saved.ref.objectID}/attempts?directory=${encodeURIComponent(project.path)}`,
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
      `/api/objects/question-set/${saved.ref.objectID}/attempts?directory=${encodeURIComponent(project.path)}`,
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
