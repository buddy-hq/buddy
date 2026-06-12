import { afterEach, describe, expect, test } from "bun:test"
import type { Hooks } from "@opencode-ai/plugin"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { compactCommandInvocationBeforeExecute } from "../../src/opencode-runtime/plugins/buddy-runtime-plugin"
import {
  formatCommandInvocationDisplay,
  persistCommandInvocationDisplay,
  withCommandInvocationDisplay,
} from "../../src/session/orchestration/command-transcript"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = SessionID.make("ses_command_transcript")
const MESSAGE_ID = MessageID.make("msg_command_transcript")
const TEXT_PART_ID = PartID.make("prt_command_transcript_text")
const CONTEXT_PART_ID = PartID.make("prt_command_transcript_context")
const SECOND_TEXT_PART_ID = PartID.make("prt_command_transcript_second_text")
const FILE_PART_ID = PartID.make("prt_command_transcript_file")
const SUBTASK_PART_ID = PartID.make("prt_command_transcript_subtask")

type CommandExecuteBeforeHook = NonNullable<Hooks["command.execute.before"]>
type CommandExecuteBeforeOutput = Parameters<CommandExecuteBeforeHook>[1]

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

function userMessage(parts: MessageV2.Part[]): MessageV2.WithParts {
  return {
    info: {
      id: MESSAGE_ID,
      sessionID: SESSION_ID,
      role: "user",
      time: { created: 100 },
      agent: "buddy",
      model: {
        providerID: ProviderID.openai,
        modelID: ModelID.make("gpt-5.4-mini"),
      },
      tools: {},
    },
    parts,
  }
}

function visibleHookText(parts: CommandExecuteBeforeOutput["parts"]): string[] {
  return parts.flatMap((part) =>
    part.type === "text" && part.synthetic !== true ? [part.text] : [],
  )
}

describe("command transcript display", () => {
  test("formats slash command invocations without expanding command templates", () => {
    expect(
      formatCommandInvocationDisplay({
        command: "whiteboard-authoring",
        argumentsText: "make the flowchart clearer",
      }),
    ).toBe("/whiteboard-authoring make the flowchart clearer")
  })

  test("omits trailing space when command arguments are empty", () => {
    expect(
      formatCommandInvocationDisplay({
        command: "whiteboard-authoring",
        argumentsText: "   ",
      }),
    ).toBe("/whiteboard-authoring")
  })

  test("compacts visible text while retaining expanded command context", () => {
    const textPart = {
      id: TEXT_PART_ID,
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "text",
      text: "Full expanded skill instructions\n\nmake the flowchart clearer",
    } satisfies MessageV2.Part
    const filePart = {
      id: FILE_PART_ID,
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "file",
      mime: "text/markdown",
      url: "file:///tmp/reference.md",
    } satisfies MessageV2.Part

    const next = withCommandInvocationDisplay(userMessage([textPart, filePart]), {
      command: "whiteboard-authoring",
      argumentsText: "make the flowchart clearer",
      contextPartID: CONTEXT_PART_ID,
    })

    expect(next.parts).toEqual([
      {
        ...textPart,
        ignored: true,
        text: "/whiteboard-authoring make the flowchart clearer",
      },
      {
        ...textPart,
        id: CONTEXT_PART_ID,
        synthetic: true,
      },
      filePart,
    ])
  })

  test("hides every expanded command text part behind one compact display", () => {
    const firstTextPart = {
      id: TEXT_PART_ID,
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "text",
      text: "Full expanded skill instructions",
    } satisfies MessageV2.Part
    const secondTextPart = {
      id: SECOND_TEXT_PART_ID,
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "text",
      text: "Additional expanded command context",
    } satisfies MessageV2.Part

    const next = withCommandInvocationDisplay(userMessage([firstTextPart, secondTextPart]), {
      command: "whiteboard-authoring",
      argumentsText: "make the flowchart clearer",
      contextPartID: CONTEXT_PART_ID,
    })

    expect(next.parts).toEqual([
      {
        ...firstTextPart,
        ignored: true,
        text: "/whiteboard-authoring make the flowchart clearer",
      },
      {
        ...firstTextPart,
        id: CONTEXT_PART_ID,
        synthetic: true,
      },
      {
        ...secondTextPart,
        id: expect.any(String),
        synthetic: true,
      },
    ])
  })

  test("inserts compact display for subtask-only commands while retaining subtask context", () => {
    const subtaskPart = {
      id: SUBTASK_PART_ID,
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "subtask",
      prompt: "Review the current changes for regressions.",
      description: "Review current changes",
      agent: "reviewer",
      command: "review",
      model: {
        providerID: ProviderID.openai,
        modelID: ModelID.make("gpt-5.4-mini"),
      },
    } satisfies MessageV2.Part

    const next = withCommandInvocationDisplay(userMessage([subtaskPart]), {
      command: "review",
      argumentsText: "focus on transcript display",
      contextPartID: CONTEXT_PART_ID,
    })

    expect(next.parts).toEqual([
      {
        id: CONTEXT_PART_ID,
        sessionID: SESSION_ID,
        messageID: MESSAGE_ID,
        type: "text",
        text: "/review focus on transcript display",
        ignored: true,
      },
      subtaskPart,
    ])

    expect(
      withCommandInvocationDisplay(next, {
        command: "review",
        argumentsText: "focus on transcript display",
        contextPartID: PartID.make("prt_command_transcript_duplicate_display"),
      }).parts,
    ).toEqual(next.parts)
  })

  test("compacts command parts before execution so transcript events never expose expanded text", async () => {
    const expandedText = "Full expanded skill instructions\n\nmake the flowchart clearer"
    const output: CommandExecuteBeforeOutput = {
      parts: [
        {
          id: "prt_command_hook_text",
          sessionID: "ses_command_hook",
          messageID: "msg_command_hook",
          type: "text",
          text: expandedText,
        },
      ],
    }

    await compactCommandInvocationBeforeExecute(
      {
        command: "whiteboard-authoring",
        sessionID: "ses_command_hook",
        arguments: "make the flowchart clearer",
      },
      output,
    )

    expect(visibleHookText(output.parts)).toEqual([
      "/whiteboard-authoring make the flowchart clearer",
    ])
    expect(output.parts).toContainEqual(
      expect.objectContaining({
        type: "text",
        synthetic: true,
        text: expandedText,
      }),
    )
  })

  test("compacts subtask command parts before execution", async () => {
    const subtaskPart = {
      id: "prt_command_hook_subtask",
      sessionID: "ses_command_hook",
      messageID: "msg_command_hook",
      type: "subtask" as const,
      prompt: "Review the current changes for regressions.",
      description: "Review current changes",
      agent: "reviewer",
    }
    const output: CommandExecuteBeforeOutput = {
      parts: [subtaskPart],
    }

    await compactCommandInvocationBeforeExecute(
      {
        command: "review",
        sessionID: "ses_command_hook",
        arguments: "focus on transcript display",
      },
      output,
    )

    expect(visibleHookText(output.parts)).toEqual(["/review focus on transcript display"])
    expect(output.parts).toContainEqual(subtaskPart)
  })

  test("persists compact display and hidden expanded context", async () => {
    await using project = await tmpdir()
    const directory = project.path
    const session = await OpenCodeInstance.provide({
      directory,
      fn: () => OpenCodeSession.create({}),
    })
    const sessionID = SessionID.make(session.id)
    const messageID = MessageID.ascending()
    const partID = PartID.ascending()
    const contextPartID = PartID.ascending()
    const expandedText = "Full expanded skill instructions\n\nmake the flowchart clearer"

    await OpenCodeInstance.provide({
      directory,
      fn: async () => {
        await OpenCodeSession.updateMessage({
          id: messageID,
          sessionID,
          role: "user",
          time: { created: 100 },
          agent: "buddy",
          model: {
            providerID: ProviderID.openai,
            modelID: ModelID.make("gpt-5.4-mini"),
          },
          tools: {},
        })
        await OpenCodeSession.updatePart({
          id: partID,
          sessionID,
          messageID,
          type: "text",
          text: expandedText,
        })
      },
    })

    await persistCommandInvocationDisplay({
      directory,
      sessionID: session.id,
      messageID,
      command: "whiteboard-authoring",
      argumentsText: "make the flowchart clearer",
      contextPartID,
    })

    const messages = await OpenCodeInstance.provide({
      directory,
      fn: () => OpenCodeSession.messages({ sessionID }),
    })

    expect(messages[0]?.parts).toContainEqual(
      {
        id: partID,
        sessionID,
        messageID,
        type: "text",
        ignored: true,
        text: "/whiteboard-authoring make the flowchart clearer",
      },
    )
    expect(messages[0]?.parts).toContainEqual(
      {
        id: contextPartID,
        sessionID,
        messageID,
        type: "text",
        synthetic: true,
        text: expandedText,
      },
    )
  })

  test("persists compact display for subtask-only commands", async () => {
    await using project = await tmpdir()
    const directory = project.path
    const session = await OpenCodeInstance.provide({
      directory,
      fn: () => OpenCodeSession.create({}),
    })
    const sessionID = SessionID.make(session.id)
    const messageID = MessageID.ascending()
    const subtaskPartID = PartID.ascending()
    const displayPartID = PartID.ascending()
    const subtaskPart = {
      id: subtaskPartID,
      sessionID,
      messageID,
      type: "subtask",
      prompt: "Review the current changes for regressions.",
      description: "Review current changes",
      agent: "reviewer",
      command: "review",
      model: {
        providerID: ProviderID.openai,
        modelID: ModelID.make("gpt-5.4-mini"),
      },
    } satisfies MessageV2.Part

    await OpenCodeInstance.provide({
      directory,
      fn: async () => {
        await OpenCodeSession.updateMessage({
          id: messageID,
          sessionID,
          role: "user",
          time: { created: 100 },
          agent: "buddy",
          model: {
            providerID: ProviderID.openai,
            modelID: ModelID.make("gpt-5.4-mini"),
          },
          tools: {},
        })
        await OpenCodeSession.updatePart(subtaskPart)
      },
    })

    await persistCommandInvocationDisplay({
      directory,
      sessionID: session.id,
      messageID,
      command: "review",
      argumentsText: "focus on transcript display",
      contextPartID: displayPartID,
    })

    const messages = await OpenCodeInstance.provide({
      directory,
      fn: () => OpenCodeSession.messages({ sessionID }),
    })

    expect(messages[0]?.parts).toContainEqual(subtaskPart)
    expect(messages[0]?.parts).toContainEqual(
      {
        id: displayPartID,
        sessionID,
        messageID,
        type: "text",
        ignored: true,
        text: "/review focus on transcript display",
      },
    )
  })
})
