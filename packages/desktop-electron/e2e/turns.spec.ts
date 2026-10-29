import path from "node:path"
import { expect, test } from "./fixtures/app"
import { uiPrompt } from "./fixtures/model-server"
import { createNotebook } from "./fixtures/notebook"

test.beforeEach(async ({ buddy }, testInfo) => {
  const { page, model } = buddy
  const notebook = await createNotebook(
    path.dirname(buddy.notebook.directory),
    model.baseURL,
    `U236 ${testInfo.title.split(" ")[0]} notebook`,
  )
  await buddy.stubOpenDirectory(notebook.directory)
  await page.getByRole("button", { name: "New notebook", exact: true }).click()
  await page.getByRole("button", { name: "Open existing folder", exact: true }).click()
  const directoryToken = Buffer.from(notebook.directory).toString("base64url")
  await page.waitForURL((url) => url.hash.startsWith(`#/${directoryToken}/chat`))
  await expect(page.getByRole("textbox", { name: "Ask Buddy", exact: true })).toBeEditable()
  await expect(page.locator("[data-timeline-row]")).toHaveCount(0)
})

test("U2 reloads during a streamed reply and finishes the same turn once", async ({ buddy }) => {
  const { page, model } = buddy
  const composer = page.getByRole("textbox", { name: "Ask Buddy", exact: true })
  const gate = model.gate()
  const reply = "U2 keeps every word of this streamed reply through a renderer reload."
  const prompt = uiPrompt({ kind: "stream", key: gate.key, text: reply })
  const userRows = page.locator('[data-timeline-row="UserMessage"]')
  const assistantRows = page.locator('[data-timeline-row="AssistantPart"]')
  const answer = assistantRows.getByText(reply, { exact: true })
  const turnRows = page.locator(
    '[data-timeline-row="UserMessage"], [data-timeline-row="AssistantPart"]',
  )
  const identities = () =>
    turnRows.evaluateAll((elements) =>
      elements.map((element) => ({
        kind: element.getAttribute("data-timeline-row"),
        messageID: element.getAttribute("data-message-id"),
      })),
    )

  try {
    await composer.fill(prompt)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await model.waitForRequest(
      (request) => request.instruction?.kind === "stream" && request.instruction.key === gate.key,
    )
    await gate.entered
    await expect(answer).toHaveCount(1)
    await expect(answer).toBeVisible()
    await expect(userRows).toHaveCount(1)
    await expect(assistantRows).toHaveCount(1)
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
    const before = await identities()
    const chatURL = page.url()

    await buddy.reload()
    await expect(page).toHaveURL(chatURL)
    await expect(userRows).toHaveCount(1)
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
    gate.release()

    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
    await expect(composer).toBeEditable()
    await expect(userRows).toHaveCount(1)
    await expect(userRows).toContainText(prompt)
    await expect(assistantRows).toHaveCount(1)
    await expect(answer).toHaveCount(1)
    await expect(answer).toBeVisible()
    await expect.poll(identities).toEqual(before)
  } finally {
    gate.release()
  }
})

test("U3 stops a reply and completes the next prompt without another stopped ending", async ({
  buddy,
}) => {
  const { page, model } = buddy
  const composer = page.getByRole("textbox", { name: "Ask Buddy", exact: true })
  const gate = model.gate()
  const partial = "U3 this reply is visibly running until Stop is pressed."
  const nextReply = "U3 the next prompt completes exactly once."
  const userRows = page.locator('[data-timeline-row="UserMessage"]')
  const assistantRows = page.locator('[data-timeline-row="AssistantPart"]')
  const stopped = page
    .locator('[data-timeline-row="TurnDivider"]')
    .filter({ has: page.getByText("Stopped", { exact: true }) })
  const turnRows = page.locator(
    '[data-timeline-row="UserMessage"], [data-timeline-row="AssistantPart"], [data-timeline-row="TurnDivider"]',
  )
  const rowKinds = () =>
    turnRows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-timeline-row")),
    )

  try {
    await composer.fill(uiPrompt({ kind: "stream", key: gate.key, text: partial }))
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await model.waitForRequest(
      (request) => request.instruction?.kind === "stream" && request.instruction.key === gate.key,
    )
    await gate.entered
    await expect(assistantRows.getByText(partial, { exact: true })).toBeVisible()
    await expect(userRows).toHaveCount(1)
    await expect(userRows).toHaveAttribute("data-message-id", /\S+/u)
    const stoppedTurnID = await userRows.getAttribute("data-message-id")
    if (!stoppedTurnID) throw new Error("The running turn has no user message identity")
    await page.getByRole("button", { name: "Stop", exact: true }).click()

    await expect(stopped).toHaveCount(1)
    await expect(stopped).toBeVisible()
    await expect(stopped).toHaveAttribute("data-message-id", stoppedTurnID)
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
    await expect(composer).toBeEditable()
    await expect.poll(rowKinds).toEqual(["UserMessage", "AssistantPart", "TurnDivider"])

    await composer.fill(uiPrompt({ kind: "reply", text: nextReply }))
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await model.waitForRequest(
      (request) => request.instruction?.kind === "reply" && request.instruction.text === nextReply,
    )
    const answer = assistantRows.getByText(nextReply, { exact: true })
    await expect(answer).toHaveCount(1)
    await expect(answer).toBeVisible()
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
    await expect(composer).toBeEditable()
    await expect(userRows).toHaveCount(2)
    await expect(assistantRows).toHaveCount(2)
    await expect(assistantRows.getByText(partial, { exact: true })).toHaveCount(1)
    await expect(stopped).toHaveCount(1)
    await expect(stopped).toHaveAttribute("data-message-id", stoppedTurnID)
    await expect
      .poll(rowKinds)
      .toEqual(["UserMessage", "AssistantPart", "TurnDivider", "UserMessage", "AssistantPart"])
  } finally {
    gate.release()
  }
})

test("U6 undo restores the composer immediately and redo restores the turn through reload", async ({
  buddy,
}) => {
  const { page, model } = buddy
  const composer = page.getByRole("textbox", { name: "Ask Buddy", exact: true })
  const reply = "U6 this completed reply returns once after redo and reload."
  const prompt = uiPrompt({ kind: "reply", text: reply })
  const userRows = page.locator('[data-timeline-row="UserMessage"]')
  const assistantRows = page.locator('[data-timeline-row="AssistantPart"]')
  const answer = assistantRows.getByText(reply, { exact: true })
  const rows = page.locator("[data-timeline-row]")
  const identities = () =>
    rows.evaluateAll((elements) =>
      elements.map((element) => ({
        kind: element.getAttribute("data-timeline-row"),
        messageID: element.getAttribute("data-message-id"),
      })),
    )

  await composer.fill(prompt)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await model.waitForRequest(
    (request) => request.instruction?.kind === "reply" && request.instruction.text === reply,
  )
  await expect(answer).toHaveCount(1)
  await expect(answer).toBeVisible()
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  await expect(userRows).toHaveCount(1)
  await expect(assistantRows).toHaveCount(1)
  const before = await identities()
  const chatURL = page.url()

  await composer.fill("/undo")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(composer).toHaveText(prompt)
  await expect(composer).toBeEditable()
  await expect(rows).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(chatURL)

  await composer.fill("/redo")
  await page.getByRole("button", { name: "Send", exact: true }).click()

  async function expectRestoredTurn() {
    await expect(userRows).toHaveCount(1)
    await expect(userRows).toContainText(prompt)
    await expect(assistantRows).toHaveCount(1)
    await expect(answer).toHaveCount(1)
    await expect(answer).toBeVisible()
    await expect.poll(identities).toEqual(before)
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
    await expect(composer).toBeEditable()
    await expect(page).toHaveURL(chatURL)
  }

  await expectRestoredTurn()
  await buddy.reload()
  await expectRestoredTurn()
})
