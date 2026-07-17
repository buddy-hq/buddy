import { describe, expect, test } from "bun:test"
import {
  buildPromptDraftFromUserMessage,
  buildPromptImageEditIntent,
  buildPromptPreviewParts,
  buildPromptSubmissionParts,
} from "../src/lib/directory-chat/chat-prompt-helpers"
import {
  PROMPT_PART_TYPE_TEXT,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "../src/components/prompt/prompt-types"
import { createMessageWithParts, createUserMessageInfo } from "./test-utils"

describe("buildPromptDraftFromUserMessage", () => {
  test("restores inline file references as structured prompt parts", () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-1", sessionID: "ses-1" }),
      [
        {
          id: "part-1",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "text",
          text: "Summarize ",
        },
        {
          id: "part-2",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "file",
          mime: "text/plain",
          filename: "README.md",
          url: "file:///repo/README.md",
        },
        {
          id: "part-3",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "text",
          text: " and ",
        },
        {
          id: "part-4",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "file",
          mime: "text/plain",
          filename: "resources/book/processed/full-text.md",
          url: "file:///repo/resources/book/processed/full-text.md",
        },
      ],
    )

    const draft = buildPromptDraftFromUserMessage(message, "/repo")

    expect(draft).toEqual({
      value: "Summarize @README.md and @resources/book/processed/full-text.md",
      parts: [
        {
          type: PROMPT_PART_TYPE_TEXT,
          text: "Summarize ",
        },
        {
          type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
          path: "README.md",
        },
        {
          type: PROMPT_PART_TYPE_TEXT,
          text: " and ",
        },
        {
          type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
          path: "resources/book/processed/full-text.md",
        },
      ],
      attachments: [],
      cursor: "Summarize @README.md and @resources/book/processed/full-text.md".length,
    })
  })

  test("restores staged image edits with their edit intent", () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-edit", sessionID: "ses-1" }),
      [
        {
          id: "part-edit",
          sessionID: "ses-1",
          messageID: "msg-edit",
          type: "file",
          mime: "image/png",
          filename: "generated.png",
          url: "data:image/png;base64,aW1hZ2U=",
          source: {
            type: "file",
            path: "/repo/generated.png",
            text: { value: "generated.png", start: 0, end: 13 },
          },
        },
      ],
    )

    const draft = buildPromptDraftFromUserMessage(message, "/repo")

    expect(draft?.attachments).toEqual([
      {
        id: "part-edit",
        filename: "generated.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64,aW1hZ2U=",
        localPath: "/repo/generated.png",
        editTarget: true,
        kind: "image",
      },
    ])
    expect(buildPromptImageEditIntent(draft?.attachments ?? [])).toEqual({
      targetPaths: ["/repo/generated.png"],
    })
  })
})

describe("buildPromptSubmissionParts", () => {
  test("marks only Edit image attachments as image edit targets", () => {
    expect(
      buildPromptImageEditIntent([
        {
          id: "edit-target",
          filename: "target.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,dGFyZ2V0",
          localPath: "/repo/target.png",
          editTarget: true,
          kind: "image",
        },
        {
          id: "ordinary-upload",
          filename: "reference.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,cmVmZXJlbmNl",
          kind: "image",
        },
      ]),
    ).toEqual({ targetPaths: ["/repo/target.png"] })
  })

  test("submits the staged image edit snapshot while retaining its local path metadata", () => {
    const parts = buildPromptSubmissionParts([], [
      {
        id: "attachment-1",
        filename: "edit me.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        localPath: "/Users/example/generated/edit me.png",
        editTarget: true,
        kind: "image",
      },
    ])

    expect(parts).toEqual([
      {
        type: "file",
        mime: "image/png",
        url: "data:image/png;base64,iVBORw0KGgo=",
        filename: "edit me.png",
        source: {
          type: "file",
          path: "/Users/example/generated/edit me.png",
          text: { value: "edit me.png", start: 0, end: 11 },
        },
      },
    ])

    expect(
      buildPromptPreviewParts([], [
        {
          id: "attachment-1",
          filename: "edit me.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          localPath: "/Users/example/generated/edit me.png",
          editTarget: true,
          kind: "image",
        },
      ]),
    ).toEqual([
      {
        type: "file",
        mime: "image/png",
        url: "data:image/png;base64,iVBORw0KGgo=",
        filename: "edit me.png",
        source: {
          type: "file",
          path: "/Users/example/generated/edit me.png",
          text: { value: "edit me.png", start: 0, end: 11 },
        },
      },
    ])
  })

  test("normalizes Windows image paths to file URLs", () => {
    const parts = buildPromptSubmissionParts([], [
      {
        id: "attachment-1",
        filename: "edit.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        localPath: "C:\\Users\\example\\generated\\edit.png",
        kind: "image",
      },
    ])

    expect(parts[0]).toEqual({
      type: "file",
      mime: "image/png",
      url: "file:///C:/Users/example/generated/edit.png",
      filename: "edit.png",
      source: {
        type: "file",
        path: "C:\\Users\\example\\generated\\edit.png",
        text: { value: "edit.png", start: 0, end: 8 },
      },
    })
  })
})
