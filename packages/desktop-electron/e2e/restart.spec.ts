import { expect, test } from "./fixtures/app"
import { uiPrompt } from "./fixtures/model-server"

for (const shutdown of ["normal quit", "SIGTERM"] as const) {
  test(`${shutdown === "normal quit" ? "U8" : "R2"} keeps a partial reply and continues after ${shutdown}`, async ({
    buddy,
  }) => {
    test.skip(
      shutdown === "SIGTERM" && process.platform === "win32",
      "Windows process termination does not deliver POSIX signals",
    )
    const { page, notebook, model } = buddy
    await buddy.stubOpenDirectory(notebook.directory)
    await page.getByRole("button", { name: "New notebook", exact: true }).click()
    await page.getByRole("button", { name: "Open existing folder", exact: true }).click()
    const directoryToken = Buffer.from(notebook.directory).toString("base64url")
    await page.waitForURL((url) => url.hash.startsWith(`#/${directoryToken}/chat`))
    await page.locator('[data-action="left-sidebar-new-chat"]').click()
    const composer = page.getByRole("textbox", { name: "Ask Buddy", exact: true })
    await expect(composer).toBeVisible()
    await expect(page.locator('[data-timeline-row="UserMessage"]')).toHaveCount(0)
    const gate = model.gate()
    const kept = `This essay was cut by ${shutdown}. Its opening paragraph must remain here exactly once, and the next reply must continue after it.`
    const prompt = uiPrompt({ kind: "stream", key: gate.key, text: kept })
    try {
      await composer.fill(prompt)
      await page.getByRole("button", { name: "Send", exact: true }).click()
      await model.waitForRequest(
        (request) => request.instruction?.kind === "stream" && request.instruction.key === gate.key,
      )
      await gate.entered
      const answer = page
        .locator('[data-timeline-row="AssistantPart"]')
        .getByText(kept, { exact: true })
      await expect(answer).toHaveCount(1)
      await expect(answer).toBeVisible()
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
      const selected = page
        .locator('[data-action="left-sidebar-thread-select"][data-active="true"]')
        .first()
      await expect(selected).toHaveAttribute("data-session-id", /\S+/u)
      const sessionID = await selected.getAttribute("data-session-id")
      if (!sessionID) throw new Error("The streaming chat has no session ID")
      const beforeRestart = model.requests.length

      if (shutdown === "normal quit") await buddy.restart()
      else await buddy.terminate("SIGTERM")

      const restored = buddy.page
      const notebookToggle = restored.locator(
        `[data-action="left-sidebar-directory-toggle"][data-directory=${JSON.stringify(notebook.directory)}]`,
      )
      await expect(notebookToggle).toBeVisible()
      if ((await notebookToggle.getAttribute("aria-expanded")) === "false")
        await notebookToggle.click()
      await restored
        .locator(
          `[data-action="left-sidebar-thread-select"][data-session-id=${JSON.stringify(sessionID)}]`,
        )
        .first()
        .click()
      await restored.waitForURL((url) => url.hash.startsWith(`#/${directoryToken}/chat`))
      const continuation = await model.waitForRequest(
        (request) =>
          model.requests.indexOf(request) >= beforeRestart &&
          request.text.includes("The server restarted while you were working."),
      )
      expect(continuation.instruction).toBeUndefined()
      expect(continuation.text).toContain(
        "Continue from where you left off without repeating completed work.",
      )
      expect(
        JSON.stringify(
          continuation.body.messages.filter((message) => message.role === "assistant"),
        ),
      ).toContain(kept)
      const replies = restored.locator('[data-timeline-row="AssistantPart"]')
      const keptReply = replies.filter({ hasText: kept })
      const resumedReply = replies.filter({ hasText: "Conformance title." })
      await expect(keptReply.getByText(kept, { exact: true })).toHaveCount(1)
      await expect(keptReply.getByText(kept, { exact: true })).toBeVisible()
      await expect(
        replies.getByRole("status").filter({ hasText: /^Continuing after restart$/u }),
      ).toBeVisible()
      await expect(resumedReply.getByText("Conformance title.", { exact: true })).toHaveCount(1)
      await expect(resumedReply.getByText("Conformance title.", { exact: true })).toBeVisible()
      await expect(restored.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
      await expect(keptReply).toHaveCount(1)
      await expect(resumedReply).toHaveCount(1)
      await expect(keptReply).not.toContainText("Conformance title.")
      await expect(resumedReply).not.toContainText(kept)
      await expect(
        restored.locator('[data-timeline-row="TurnDivider"]').getByText("Stopped", { exact: true }),
      ).toHaveCount(0)
      await expect(restored.locator('[data-timeline-row="UserMessage"]')).toHaveCount(1)
      await expect(restored.getByRole("textbox", { name: "Ask Buddy", exact: true })).toBeEditable()
    } finally {
      gate.release()
    }
  })
}
