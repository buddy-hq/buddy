import { MessageID, PartID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"

export type CommandInvocationDisplay = {
  command: string
  argumentsText: string
  contextPartID?: PartID
}

export function formatCommandInvocationDisplay(input: CommandInvocationDisplay): string {
  const command = input.command.trim()
  const argumentsText = input.argumentsText.trim()
  return argumentsText ? `/${command} ${argumentsText}` : `/${command}`
}

export type CommandTranscriptPartLike = {
  type: string
  text?: string
  synthetic?: boolean
  ignored?: boolean
}

function isTextPart(part: MessageV2.Part): part is MessageV2.Part & { type: "text"; text: string } {
  return part.type === "text"
}

function isTextPartLike<Part extends CommandTranscriptPartLike>(
  part: Part,
): part is Part & { type: "text"; text: string } {
  return part.type === "text" && typeof part.text === "string"
}

function isVisibleTextPartLike<Part extends CommandTranscriptPartLike>(
  part: Part,
): part is Part & { type: "text"; text: string } {
  return isTextPartLike(part) && part.synthetic !== true && part.ignored !== true
}

function isCommandDisplayPart<Part extends CommandTranscriptPartLike>(
  part: Part,
  displayText: string,
): boolean {
  return (
    isTextPartLike(part) &&
    part.synthetic !== true &&
    part.ignored === true &&
    part.text === displayText
  )
}

function isSubtaskPart(part: CommandTranscriptPartLike): boolean {
  return part.type === "subtask"
}

function createCommandDisplayPart(input: {
  message: MessageV2.WithParts
  displayText: string
  partID: PartID
}): MessageV2.Part {
  return {
    id: input.partID,
    sessionID: input.message.info.sessionID,
    messageID: input.message.info.id,
    type: "text",
    text: input.displayText,
    ignored: true,
  }
}

export function withCommandInvocationDisplayParts<Part extends CommandTranscriptPartLike>(input: {
  parts: Part[]
  displayText: string
  createDisplayPart: () => Part
  cloneAsDisplayPart: (part: Part & { type: "text"; text: string }) => Part
  cloneAsContextPart: (part: Part & { type: "text"; text: string }) => Part
}): Part[] {
  let displayInserted = input.parts.some((part) => isCommandDisplayPart(part, input.displayText))
  const parts = input.parts.flatMap((part): Part[] => {
    if (!isVisibleTextPartLike(part)) {
      return [part]
    }

    if (displayInserted) {
      return [input.cloneAsContextPart(part)]
    }

    displayInserted = true
    if (part.text === input.displayText) {
      return [input.cloneAsDisplayPart(part)]
    }

    return [input.cloneAsDisplayPart(part), input.cloneAsContextPart(part)]
  })

  if (displayInserted) {
    return parts
  }

  const subtaskIndex = parts.findIndex(isSubtaskPart)
  const displayIndex = subtaskIndex === -1 ? 0 : subtaskIndex
  const displayPart = input.createDisplayPart()
  return [...parts.slice(0, displayIndex), displayPart, ...parts.slice(displayIndex)]
}

export function withCommandInvocationDisplay(
  message: MessageV2.WithParts,
  input: CommandInvocationDisplay,
): MessageV2.WithParts {
  if (message.info.role !== "user") {
    return message
  }

  const displayText = formatCommandInvocationDisplay(input)
  let usedContextPartID = false
  function nextContextPartID() {
    if (!usedContextPartID && input.contextPartID) {
      usedContextPartID = true
      return input.contextPartID
    }
    return PartID.ascending()
  }
  const parts = withCommandInvocationDisplayParts({
    parts: message.parts,
    displayText,
    createDisplayPart: () =>
      createCommandDisplayPart({
        message,
        displayText,
        partID: input.contextPartID ?? PartID.ascending(),
      }),
    cloneAsDisplayPart: (part) => ({
      ...part,
      ignored: true,
      text: displayText,
    }),
    cloneAsContextPart: (part) => ({
      ...part,
      id: nextContextPartID(),
      synthetic: true,
    }),
  })

  return { ...message, parts }
}

function shouldPersistPartUpdate(input: {
  current: MessageV2.Part | undefined
  next: MessageV2.Part
}) {
  if (!isTextPart(input.next)) return false
  if (!input.current || !isTextPart(input.current)) return true

  return (
    input.current.text !== input.next.text ||
    input.current.ignored !== input.next.ignored ||
    input.current.synthetic !== input.next.synthetic
  )
}

export async function persistCommandInvocationDisplay(input: {
  directory: string
  sessionID: string
  messageID: MessageID
  command: string
  argumentsText: string
  contextPartID?: PartID
}): Promise<void> {
  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const messages = await OpenCodeSession.messages({
        sessionID: SessionID.make(input.sessionID),
      })
      const message = messages.find((item) => item.info.id === input.messageID)
      if (!message) return

      const next = withCommandInvocationDisplay(message, input)
      const currentPartsByID = new Map(message.parts.map((part) => [part.id, part]))
      for (const part of next.parts) {
        if (!shouldPersistPartUpdate({ current: currentPartsByID.get(part.id), next: part })) {
          continue
        }
        await OpenCodeSession.updatePart(part)
      }
    },
  })
}
