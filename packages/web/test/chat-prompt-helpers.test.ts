import { describe, expect, test } from "bun:test"
import {
  READER_ANCHOR_KIND_CFI_TEXT,
  READER_ANCHOR_KIND_PDF_TEXT,
} from "@buddy/reader-contract"
import {
  buildCommandAttachmentParts,
  buildPromptDraftFromUserMessage,
  buildPromptImageEditIntent,
  buildPromptPreviewParts,
  buildPromptSubmissionParts,
} from "../src/lib/directory-chat/chat-prompt-helpers"
import {
  BUDDY_PROMPT_PART_METADATA_KEY,
  PROMPT_PART_TYPE_TEXT,
  SELECTION_CONTEXT_PART_TYPE,
  TEXT_FILE_ATTACHMENT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
  type PromptComposerAttachment,
  type PromptSubmissionPart,
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

  test("restores text-file metadata as an attachment instead of composer text", () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-text-file", sessionID: "ses-1" }),
      [
        {
          id: "part-prompt",
          sessionID: "ses-1",
          messageID: "msg-text-file",
          type: "text",
          text: "Summarize the attachment",
        },
        {
          id: "part-attachment",
          sessionID: "ses-1",
          messageID: "msg-text-file",
          type: "text",
          text: "Attached file (notes.md):\n# Notes\n\nSee @README.md",
          metadata: {
            [BUDDY_PROMPT_PART_METADATA_KEY]: {
              type: TEXT_FILE_ATTACHMENT_PART_TYPE,
              filename: "notes.md",
              mime: "text/plain",
            },
          },
        },
      ],
    )

    const draft = buildPromptDraftFromUserMessage(message, "/repo")

    expect(draft?.value).toBe("Summarize the attachment")
    expect(draft?.attachments).toEqual([
      {
        id: "part-attachment",
        filename: "notes.md",
        mime: "text/plain",
        dataUrl: "data:text/plain;charset=utf-8,%23%20Notes%0A%0ASee%20%40README.md",
        kind: "file",
      },
    ])
  })

  test("restores historical CFI metadata as a neutral text anchor", () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-legacy", sessionID: "ses-1" }),
      [
        {
          id: "part-legacy",
          sessionID: "ses-1",
          messageID: "msg-legacy",
          type: "text",
          text: "Legacy selected text",
          metadata: {
            buddyPromptPart: {
              type: SELECTION_CONTEXT_PART_TYPE,
              source: "reading",
              text: "Legacy selected text",
              selectionKey: "selection-legacy",
              cfi: "epubcfi(/6/2)",
              index: 1,
            },
          },
        },
      ],
    )

    expect(buildPromptDraftFromUserMessage(message, "/repo")?.parts).toEqual([
      {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "reading",
        text: "Legacy selected text",
        selectionKey: "selection-legacy",
        anchor: {
          kind: READER_ANCHOR_KIND_CFI_TEXT,
          cfi: "epubcfi(/6/2)",
          sectionIndex: 1,
        },
      },
    ])
  })

  test("restores direct PDF selection parts without flattened location fields", () => {
    const anchor = {
      kind: READER_ANCHOR_KIND_PDF_TEXT,
      segments: [
        {
          pageIndex: 0,
          quads: [
            {
              topLeft: { x: 5, y: 10 },
              topRight: { x: 30, y: 10 },
              bottomRight: { x: 30, y: 22 },
              bottomLeft: { x: 5, y: 22 },
            },
          ],
        },
      ],
      quote: { exact: "PDF selected text" },
    }
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-pdf", sessionID: "ses-1" }),
      [
        {
          id: "part-pdf",
          sessionID: "ses-1",
          messageID: "msg-pdf",
          type: SELECTION_CONTEXT_PART_TYPE,
          source: "reading",
          text: "PDF selected text",
          selectionKey: "selection-pdf",
          anchor,
        },
      ],
    )

    expect(buildPromptDraftFromUserMessage(message, "/repo")?.parts).toEqual([
      {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "reading",
        text: "PDF selected text",
        selectionKey: "selection-pdf",
        anchor,
      },
    ])
  })
})

describe("buildPromptSubmissionParts", () => {
  test("marks decoded text attachments so the transcript can keep their file identity", () => {
    const attachment: PromptComposerAttachment = {
      id: "notes",
      filename: "notes.md",
      mime: "text/plain",
      dataUrl: "data:text/plain;base64,IyBOb3RlcwoKU2VlIEBSRUFETUUubWQ=",
      kind: "file",
    }
    const expectedPart = {
      type: "text",
      text: "Attached file (notes.md):\n# Notes\n\nSee @README.md",
      metadata: {
        [BUDDY_PROMPT_PART_METADATA_KEY]: {
          type: TEXT_FILE_ATTACHMENT_PART_TYPE,
          filename: "notes.md",
          mime: "text/plain",
        },
      },
    } satisfies PromptSubmissionPart

    expect(buildPromptSubmissionParts([], [attachment])).toEqual([expectedPart])
    expect(buildPromptPreviewParts([], [attachment])).toEqual([expectedPart])
  })

  test("rejects native resources from the custom slash-command attachment path", () => {
    const attachment: PromptComposerAttachment = {
      id: "epub",
      filename: "Reader.epub",
      mime: "application/epub+zip",
      kind: "native-resource",
      format: "epub",
      delivery: "resource-only",
      status: "ready",
      uploadID: "epub-upload",
      workspacePath: "uploads/Reader--abcdefghij.epub",
      localPath: "/repo/uploads/Reader--abcdefghij.epub",
      sizeBytes: 256,
    }

    expect(buildCommandAttachmentParts([attachment])).toBeUndefined()
  })

  test("sends PDFs through both provider and resource paths while keeping other documents metadata-only", () => {
    const attachments: PromptComposerAttachment[] = [
      {
        id: "pdf",
        filename: "Seasons.pdf",
        mime: "application/pdf",
        kind: "native-resource",
        format: "pdf",
        delivery: "model-and-resource",
        status: "ready",
        uploadID: "pdf-upload",
        workspacePath: "uploads/Seasons--1234567890.pdf",
        localPath: "/repo/uploads/Seasons--1234567890.pdf",
        sizeBytes: 128,
      },
      {
        id: "epub",
        filename: "Reader.epub",
        mime: "application/epub+zip",
        kind: "native-resource",
        format: "epub",
        delivery: "resource-only",
        status: "ready",
        uploadID: "epub-upload",
        workspacePath: "uploads/Reader--abcdefghij.epub",
        localPath: "/repo/uploads/Reader--abcdefghij.epub",
        sizeBytes: 256,
      },
    ]

    expect(buildPromptSubmissionParts([], attachments)).toEqual([
      {
        type: "native-resource-attachment",
        filename: "Seasons.pdf",
        sourcePath: "/repo/uploads/Seasons--1234567890.pdf",
        format: "pdf",
        alias: "Seasons.pdf",
        mime: "application/pdf",
      },
      {
        type: "file",
        mime: "application/pdf",
        url: "file:///repo/uploads/Seasons--1234567890.pdf",
        filename: "Seasons.pdf",
        source: {
          type: "file",
          path: "/repo/uploads/Seasons--1234567890.pdf",
          text: { value: "Seasons.pdf", start: 0, end: 11 },
        },
      },
      {
        type: "native-resource-attachment",
        filename: "Reader.epub",
        sourcePath: "/repo/uploads/Reader--abcdefghij.epub",
        format: "epub",
        alias: "Reader.epub",
        mime: "application/epub+zip",
      },
    ])
    expect(buildPromptPreviewParts([], attachments).map((part) => part.type)).toEqual([
      "native-resource-attachment",
      "native-resource-attachment",
    ])
  })

  test("restores one ready native attachment from persisted runtime metadata", () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-native", sessionID: "ses-1" }),
      [
        {
          id: "metadata-part",
          sessionID: "ses-1",
          messageID: "msg-native",
          type: "text",
          text: "Attached native learning resource metadata",
          metadata: {
            buddyPromptPart: {
              type: "native-resource-attachment",
              filename: "Workbook.xlsx",
              sourcePath: "/repo/uploads/Workbook--abcdefghij.xlsx",
              format: "xlsx",
              alias: "Workbook.xlsx",
              mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          },
        },
      ],
    )

    expect(buildPromptDraftFromUserMessage(message, "/repo")?.attachments).toEqual([
      {
        id: "metadata-part",
        filename: "Workbook.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        kind: "native-resource",
        format: "xlsx",
        delivery: "resource-only",
        status: "ready",
        uploadID: "metadata-part",
        workspacePath: "uploads/Workbook--abcdefghij.xlsx",
        localPath: "/repo/uploads/Workbook--abcdefghij.xlsx",
        sizeBytes: 0,
      },
    ])
  })

  test("does not restore the persisted provider copy of a dual-path PDF twice", () => {
    const sourcePath = "/repo/uploads/Lesson--abcdefghij.pdf"
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-native-pdf", sessionID: "ses-1" }),
      [
        {
          id: "metadata-part",
          sessionID: "ses-1",
          messageID: "msg-native-pdf",
          type: "text",
          text: "Attached native learning resource metadata",
          metadata: {
            buddyPromptPart: {
              type: "native-resource-attachment",
              filename: "Lesson.pdf",
              sourcePath,
              format: "pdf",
              alias: "Lesson.pdf",
              mime: "application/pdf",
            },
          },
        },
        {
          id: "provider-file-part",
          sessionID: "ses-1",
          messageID: "msg-native-pdf",
          type: "file",
          mime: "application/pdf",
          filename: "Lesson.pdf",
          url: "data:application/pdf;base64,JVBERg==",
          source: {
            type: "file",
            path: sourcePath,
            text: { value: "Lesson.pdf", start: 0, end: 10 },
          },
        },
      ],
    )

    const draft = buildPromptDraftFromUserMessage(message, "/repo")
    expect(draft?.attachments).toHaveLength(1)
    expect(draft?.attachments[0]).toMatchObject({
      kind: "native-resource",
      format: "pdf",
      localPath: sourcePath,
    })
  })

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
    const parts = buildPromptSubmissionParts(
      [],
      [
        {
          id: "attachment-1",
          filename: "edit me.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          localPath: "/Users/example/generated/edit me.png",
          editTarget: true,
          kind: "image",
        },
      ],
    )

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
      buildPromptPreviewParts(
        [],
        [
          {
            id: "attachment-1",
            filename: "edit me.png",
            mime: "image/png",
            dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            localPath: "/Users/example/generated/edit me.png",
            editTarget: true,
            kind: "image",
          },
        ],
      ),
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
    const parts = buildPromptSubmissionParts(
      [],
      [
        {
          id: "attachment-1",
          filename: "edit.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          localPath: "C:\\Users\\example\\generated\\edit.png",
          kind: "image",
        },
      ],
    )

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
