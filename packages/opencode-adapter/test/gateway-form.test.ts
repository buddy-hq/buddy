import { expect, test } from "bun:test"
import type { FormInfo, OpenCodeEvent } from "@opencode/client"
import { toBuddyQuestion, toBuddyQuestionEvent, toFormAnswer } from "../src/gateway/form"

const form = {
  id: "frm_question",
  sessionID: "ses_questions",
  title: "Questions",
  metadata: { kind: "question", tool: { messageID: "msg_question", id: "call_question" } },
  fields: [
    {
      key: "q0",
      type: "string",
      title: "Format",
      description: "Which format?",
      options: [{ value: "pdf", label: "PDF" }],
      custom: true,
    },
    {
      key: "q1",
      type: "multiselect",
      title: "Extras",
      options: [{ value: "notes", label: "Notes", description: "Add notes" }],
      custom: true,
    },
  ],
} satisfies FormInfo

test("projects question option labels and maps submitted labels to native form values", () => {
  expect(toBuddyQuestion(form)).toEqual({
    id: "frm_question",
    sessionID: "ses_questions",
    tool: { messageID: "msg_question", callID: "call_question" },
    questions: [
      {
        header: "Format",
        question: "Which format?",
        options: [{ label: "PDF", description: "" }],
        multiple: false,
        custom: true,
      },
      {
        header: "Extras",
        question: "",
        options: [{ label: "Notes", description: "Add notes" }],
        multiple: true,
        custom: true,
      },
    ],
  })
  expect(toFormAnswer(form, [["PDF"], ["Notes", "Custom"]])).toEqual({
    ok: true,
    answer: { q0: "pdf", q1: ["notes", "Custom"] },
  })
  expect(toFormAnswer(form, [["PDF", "Other"], []])).toMatchObject({ ok: false })
})

test.each(["form.cancelled", "form.replied"] as const)(
  "announces MCP input and settles it on %s without assigning a chat or notebook",
  (type) => {
    const hiddenForms = new Set<string>()
    const mcpInputRequests = new Set<string>()
    const elicitation = {
      ...form,
      id: "frm_elicitation",
      sessionID: "global",
      metadata: { kind: "mcp-elicitation", server: "Docs Server", message: "Confirm access" },
      fields: [{ key: "confirmed", type: "boolean" }],
    } satisfies FormInfo
    expect(toBuddyQuestion(elicitation)).toBeUndefined()
    expect(
      toBuddyQuestionEvent(
        { id: "evt_elicitation", created: 1, type: "form.created", data: { form: elicitation } },
        "/notebook",
        hiddenForms,
        mcpInputRequests,
      ),
    ).toEqual({
      payload: {
        type: "mcp.input.requested",
        properties: {
          requestID: elicitation.id,
          server: "Docs Server",
          message: "Confirm access",
          toolPrefix: "Docs_Server",
        },
      },
    })
    const settlement: OpenCodeEvent =
      type === "form.replied"
        ? {
            id: "evt_settled",
            created: 2,
            type,
            data: { id: elicitation.id, sessionID: "global", answer: { confirmed: true } },
          }
        : { id: "evt_settled", created: 2, type, data: { id: elicitation.id, sessionID: "global" } }
    expect(
      toBuddyQuestionEvent(settlement, "/another-notebook", hiddenForms, mcpInputRequests),
    ).toEqual({
      payload: { type: "mcp.input.settled", properties: { requestID: elicitation.id } },
    })
  },
)

test.each([
  ["My Server", "My_Server"],
  ["docs.search", "docs_search"],
  ["my-server", "my-server"],
  ["UPPER_case", "UPPER_case"],
  ["123tools", "123tools"],
  ["café_日本", "caf____"],
  ["", ""],
  [" . ", "___"],
])("uses OpenCode's namespace for %j", (server, toolPrefix) => {
  const event: OpenCodeEvent = {
    id: "evt_namespace",
    created: 1,
    type: "form.created",
    data: { form: { ...form, sessionID: "global", metadata: { kind: "mcp-elicitation", server } } },
  }
  expect(toBuddyQuestionEvent(event, "/notebook", new Set(), new Set())?.payload).toEqual({
    type: "mcp.input.requested",
    properties: { requestID: form.id, server, toolPrefix },
  })
})

test("keeps non-MCP global forms and their settlements hidden", () => {
  const hiddenForms = new Set<string>()
  const mcpInputRequests = new Set<string>()
  for (const kind of ["question", "websearch.provider"]) {
    const hidden = { ...form, id: `frm_${kind}`, sessionID: "global", metadata: { kind } }
    expect(
      toBuddyQuestionEvent(
        { id: "evt_hidden", created: 1, type: "form.created", data: { form: hidden } },
        "/notebook",
        hiddenForms,
        mcpInputRequests,
      ),
    ).toBeUndefined()
    expect(
      toBuddyQuestionEvent(
        {
          id: "evt_hidden_cancel",
          created: 2,
          type: "form.cancelled",
          data: { id: hidden.id, sessionID: "global" },
        },
        "/notebook",
        hiddenForms,
        mcpInputRequests,
      ),
    ).toBeUndefined()
  }
})

test("keeps skipped questions empty when a later answer is broadcast", () => {
  const hiddenForms = new Set<string>()
  const mcpInputRequests = new Set<string>()
  const submitted = toFormAnswer(form, [[], ["Notes"]])
  if (!submitted.ok) throw new Error(submitted.error)
  const event: OpenCodeEvent = {
    id: "evt_answered",
    created: 2,
    type: "form.replied",
    data: { id: form.id, sessionID: form.sessionID, answer: submitted.answer },
  }
  expect(toBuddyQuestionEvent(event, "/notebook", hiddenForms, mcpInputRequests)?.payload).toEqual({
    type: "question.replied",
    properties: { sessionID: form.sessionID, requestID: form.id, answers: [[], ["notes"]] },
  })
})

test("hides settlements of forms Buddy did not show and keeps question settlements", () => {
  const hiddenForms = new Set<string>()
  const mcpInputRequests = new Set<string>()
  const hidden = { ...form, id: "frm_provider", metadata: { kind: "websearch.provider" } }
  expect(
    toBuddyQuestionEvent(
      { id: "evt_hidden", created: 1, type: "form.created", data: { form: hidden } },
      "/notebook",
      hiddenForms,
      mcpInputRequests,
    ),
  ).toBeUndefined()
  expect(
    toBuddyQuestionEvent(
      {
        id: "evt_hidden_reply",
        created: 2,
        type: "form.replied",
        data: { id: hidden.id, sessionID: hidden.sessionID, answer: { choice: "allow" } },
      },
      "/notebook",
      hiddenForms,
      mcpInputRequests,
    ),
  ).toBeUndefined()
  expect(
    toBuddyQuestionEvent(
      {
        id: "evt_hidden_cancel",
        created: 3,
        type: "form.cancelled",
        data: { id: hidden.id, sessionID: hidden.sessionID },
      },
      "/notebook",
      hiddenForms,
      mcpInputRequests,
    ),
  ).toBeUndefined()
  expect(
    toBuddyQuestionEvent(
      {
        id: "evt_unseen",
        created: 4,
        type: "form.cancelled",
        data: { id: "frm_unseen", sessionID: form.sessionID },
      },
      "/notebook",
      hiddenForms,
      mcpInputRequests,
    )?.payload,
  ).toMatchObject({ type: "question.rejected", properties: { requestID: "frm_unseen" } })
  expect(
    toBuddyQuestionEvent(
      { id: "evt_visible", created: 5, type: "form.created", data: { form } },
      "/notebook",
      hiddenForms,
      mcpInputRequests,
    )?.payload.type,
  ).toBe("question.asked")
  expect(
    toBuddyQuestionEvent(
      {
        id: "evt_visible_reply",
        created: 6,
        type: "form.replied",
        data: { id: form.id, sessionID: form.sessionID, answer: { q0: "pdf" } },
      },
      "/notebook",
      hiddenForms,
      mcpInputRequests,
    )?.payload,
  ).toMatchObject({
    type: "question.replied",
    properties: { requestID: form.id, answers: [["pdf"]] },
  })
  const cancelled = { ...form, id: "frm_cancelled" }
  toBuddyQuestionEvent(
    { id: "evt_visible_again", created: 7, type: "form.created", data: { form: cancelled } },
    "/notebook",
    hiddenForms,
    mcpInputRequests,
  )
  expect(
    toBuddyQuestionEvent(
      {
        id: "evt_visible_cancel",
        created: 8,
        type: "form.cancelled",
        data: { id: cancelled.id, sessionID: cancelled.sessionID },
      },
      "/notebook",
      hiddenForms,
      mcpInputRequests,
    )?.payload,
  ).toMatchObject({
    type: "question.rejected",
    properties: { requestID: cancelled.id, sessionID: cancelled.sessionID },
  })
})

test("caps each subscription at 256 MCP request IDs and ignores settlements of evicted IDs", () => {
  const hidden = new Set<string>()
  const pending = new Set<string>()
  for (let index = 0; index < 257; index++) {
    toBuddyQuestionEvent(
      {
        id: `evt_${index}`,
        created: index,
        type: "form.created",
        data: {
          form: {
            ...form,
            id: `frm_${index}`,
            sessionID: "global",
            metadata: { kind: "mcp-elicitation", server: "Docs" },
          },
        },
      },
      "/notebook",
      hidden,
      pending,
    )
  }
  expect(pending.size).toBe(256)
  expect(
    toBuddyQuestionEvent(
      {
        id: "evt_old",
        created: 258,
        type: "form.cancelled",
        data: { id: "frm_0", sessionID: "global" },
      },
      "/notebook",
      hidden,
      pending,
    ),
  ).toBeUndefined()
  expect(
    toBuddyQuestionEvent(
      {
        id: "evt_recent",
        created: 259,
        type: "form.cancelled",
        data: { id: "frm_1", sessionID: "global" },
      },
      "/notebook",
      hidden,
      pending,
    )?.payload,
  ).toEqual({ type: "mcp.input.settled", properties: { requestID: "frm_1" } })
})
