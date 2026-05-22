import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { createBuddyPiUiContext, type BuddyQuestionRequest } from "../../src/pi-backend/ui-requests"
import { tmpdir } from "../helpers/tmpdir"

describe("question routes", () => {
  test("lists and resolves pending PI extension UI select requests", async () => {
    await using project = await tmpdir({ git: true })

    const ui = createBuddyPiUiContext({
      directory: project.path,
      sessionID: "ses_question_select",
    })

    const selectionPromise = ui.select("Pick a mode", ["Alpha", "Beta"])

    const listResponse = await app.request("/api/question", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as BuddyQuestionRequest[]
    expect(listBody).toHaveLength(1)
    expect(listBody[0]?.sessionID).toBe("ses_question_select")
    expect(listBody[0]?.questions[0]?.options.map((option) => option.label)).toEqual([
      "Alpha",
      "Beta",
    ])

    const requestID = listBody[0]?.id
    if (!requestID) {
      throw new Error("Expected a pending question request")
    }

    const replyResponse = await app.request(`/api/question/${requestID}/reply`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: [["Beta"]],
      }),
    })

    expect(replyResponse.status).toBe(200)
    await expect(replyResponse.json()).resolves.toBe(true)
    await expect(selectionPromise).resolves.toBe("Beta")

    const emptyResponse = await app.request("/api/question", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(emptyResponse.status).toBe(200)
    await expect(emptyResponse.json()).resolves.toEqual([])
  })

  test("rejects pending PI extension UI input requests", async () => {
    await using project = await tmpdir({ git: true })

    const ui = createBuddyPiUiContext({
      directory: project.path,
      sessionID: "ses_question_input",
    })

    const inputPromise = ui.input("Add a note", "Type a note")

    const listResponse = await app.request("/api/question", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as BuddyQuestionRequest[]
    expect(listBody).toHaveLength(1)
    expect(listBody[0]?.questions[0]?.custom).toBe(true)

    const requestID = listBody[0]?.id
    if (!requestID) {
      throw new Error("Expected a pending question request")
    }

    const rejectResponse = await app.request(`/api/question/${requestID}/reject`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(rejectResponse.status).toBe(200)
    await expect(rejectResponse.json()).resolves.toBe(true)
    await expect(inputPromise).resolves.toBeUndefined()
  })
})
