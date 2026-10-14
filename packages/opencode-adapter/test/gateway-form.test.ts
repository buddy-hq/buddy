import { expect, test } from "bun:test"
import type { FormInfo, OpenCodeEvent } from "@opencode/client"
import { toBuddyQuestion, toBuddyQuestionEvent, toFormAnswer } from "../src/gateway/form"

const form = {
  id: "frm_question", sessionID: "ses_questions", title: "Questions",
  metadata: { kind: "question", tool: { messageID: "msg_question", id: "call_question" } },
  fields: [
    { key: "q0", type: "string", title: "Format", description: "Which format?", options: [{ value: "pdf", label: "PDF" }], custom: true },
    { key: "q1", type: "multiselect", title: "Extras", options: [{ value: "notes", label: "Notes", description: "Add notes" }], custom: true },
  ],
} satisfies FormInfo

test("projects question option labels and maps submitted labels to native form values", () => {
  expect(toBuddyQuestion(form)).toEqual({ id: "frm_question", sessionID: "ses_questions", tool: { messageID: "msg_question", callID: "call_question" }, questions: [
    { header: "Format", question: "Which format?", options: [{ label: "PDF", description: "" }], multiple: false, custom: true },
    { header: "Extras", question: "", options: [{ label: "Notes", description: "Add notes" }], multiple: true, custom: true },
  ] })
  expect(toFormAnswer(form, [["PDF"], ["Notes", "Custom"]])).toEqual({ ok: true, answer: { q0: "pdf", q1: ["notes", "Custom"] } })
  expect(toFormAnswer(form, [["PDF", "Other"], []])).toMatchObject({ ok: false })
})

test("does not turn MCP elicitation or other forms into a web question prompt", () => {
  const elicitation = { ...form, sessionID: "global", metadata: { kind: "mcp-elicitation" } }
  const event: OpenCodeEvent = { id: "evt_elicitation", created: 1, type: "form.created", data: { form: elicitation } }
  expect(toBuddyQuestion(elicitation)).toBeUndefined()
  expect(toBuddyQuestionEvent(event, "/notebook")).toBeUndefined()
  expect(toBuddyQuestionEvent({ id: "evt_cancelled", created: 2, type: "form.cancelled", data: { id: "frm_elicitation", sessionID: "global" } }, "/notebook")).toBeUndefined()
})
