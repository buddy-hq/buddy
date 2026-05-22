import crypto from "node:crypto"
import type { ExtensionUIContext, ExtensionUIDialogOptions } from "@earendil-works/pi-coding-agent"
import { directoryKey as normalizeDirectoryKey } from "./directory-key"
import { publishPiEvent } from "./event-bus"

const QUESTION_ASKED_EVENT = "question.asked" as const
const QUESTION_REPLIED_EVENT = "question.replied" as const
const QUESTION_REJECTED_EVENT = "question.rejected" as const
const PERMISSION_ASKED_EVENT = "permission.asked" as const
const PERMISSION_REPLIED_EVENT = "permission.replied" as const
const DEFAULT_QUESTION_HEADER = "Question" as const
const DEFAULT_CONFIRM_HEADER = "Confirm" as const
const DEFAULT_INPUT_HEADER = "Input" as const
const DEFAULT_EDITOR_HEADER = "Editor" as const
const MAX_QUESTION_HEADER_LENGTH = 16 as const
const CONFIRM_YES_LABEL = "Yes" as const
const CONFIRM_NO_LABEL = "No" as const
const CONFIRM_YES_DESCRIPTION = "Proceed with this action." as const
const CONFIRM_NO_DESCRIPTION = "Do not proceed." as const

export type BuddyPermissionReply = "once" | "always" | "reject"
export type BuddyPermissionResolution = {
  reply: BuddyPermissionReply
  message?: string
}

export type BuddyPermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: {
    messageID: string
    callID: string
  } | null
}

export type BuddyQuestionOption = {
  label: string
  description: string
}

export type BuddyQuestionInfo = {
  question: string
  header: string
  options: BuddyQuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type BuddyQuestionRequest = {
  id: string
  sessionID: string
  questions: BuddyQuestionInfo[]
  tool?: {
    messageID: string
    callID: string
  } | null
}

type PendingQuestionKind = "select" | "confirm" | "input" | "editor" | "question"

type PendingQuestionResolution = string | boolean | undefined | string[][]

type PendingQuestionEntry = {
  directory: string
  request: BuddyQuestionRequest
  kind: PendingQuestionKind
  defaultValue: PendingQuestionResolution
  resolve: (value: PendingQuestionResolution) => void
  timeoutID?: ReturnType<typeof setTimeout>
  abortListener?: () => void
  signal?: AbortSignal
}

type PendingPermissionEntry = {
  directory: string
  request: BuddyPermissionRequest
  resolve: (value: BuddyPermissionResolution) => void
  timeoutID?: ReturnType<typeof setTimeout>
  abortListener?: () => void
  signal?: AbortSignal
}

const pendingQuestions = new Map<string, PendingQuestionEntry>()
const pendingPermissions = new Map<string, PendingPermissionEntry>()

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function truncateHeader(value: string, fallback: string) {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, MAX_QUESTION_HEADER_LENGTH)
}

function headerFromTitle(title: string, fallback: string) {
  const firstLine = title.split(/\r?\n/u)[0] ?? ""
  return truncateHeader(firstLine, fallback)
}

function cleanupQuestionEntry(entry: PendingQuestionEntry) {
  if (entry.timeoutID) {
    clearTimeout(entry.timeoutID)
  }
  if (entry.abortListener && entry.signal) {
    entry.signal.removeEventListener("abort", entry.abortListener)
  }
}

function cleanupPermissionEntry(entry: PendingPermissionEntry) {
  if (entry.timeoutID) {
    clearTimeout(entry.timeoutID)
  }
  if (entry.abortListener && entry.signal) {
    entry.signal.removeEventListener("abort", entry.abortListener)
  }
}

function finalizeQuestionRequest(
  requestID: string,
  resolution: PendingQuestionResolution,
  eventType: typeof QUESTION_REPLIED_EVENT | typeof QUESTION_REJECTED_EVENT,
) {
  const entry = pendingQuestions.get(requestID)
  if (!entry) return false
  pendingQuestions.delete(requestID)
  cleanupQuestionEntry(entry)
  entry.resolve(resolution)
  publishPiEvent({
    directory: entry.directory,
    payload: {
      type: eventType,
      properties: {
        requestID,
        sessionID: entry.request.sessionID,
      },
    },
  })
  return true
}

function finalizePermissionRequest(requestID: string, resolution: BuddyPermissionResolution) {
  const entry = pendingPermissions.get(requestID)
  if (!entry) return false
  pendingPermissions.delete(requestID)
  cleanupPermissionEntry(entry)
  entry.resolve(resolution)
  publishPiEvent({
    directory: entry.directory,
    payload: {
      type: PERMISSION_REPLIED_EVENT,
      properties: {
        requestID,
        sessionID: entry.request.sessionID,
        reply: resolution.reply,
      },
    },
  })
  return true
}

function createQuestionPromise<T extends PendingQuestionResolution>(input: {
  directory: string
  request: BuddyQuestionRequest
  kind: PendingQuestionKind
  defaultValue: T
  options?: ExtensionUIDialogOptions
}): Promise<T> {
  if (input.options?.signal?.aborted) {
    return Promise.resolve(input.defaultValue)
  }

  return new Promise<T>((resolve) => {
    const entry: PendingQuestionEntry = {
      directory: normalizeDirectoryKey(input.directory),
      request: input.request,
      kind: input.kind,
      defaultValue: input.defaultValue,
      resolve(value) {
        resolve((value as T | undefined) ?? input.defaultValue)
      },
      ...(input.options?.signal ? { signal: input.options.signal } : {}),
    }

    if (input.options?.signal) {
      entry.abortListener = () => {
        finalizeQuestionRequest(input.request.id, input.defaultValue, QUESTION_REJECTED_EVENT)
      }
      input.options.signal.addEventListener("abort", entry.abortListener, { once: true })
    }

    if (typeof input.options?.timeout === "number" && input.options.timeout > 0) {
      entry.timeoutID = setTimeout(() => {
        finalizeQuestionRequest(input.request.id, input.defaultValue, QUESTION_REJECTED_EVENT)
      }, input.options.timeout)
    }

    pendingQuestions.set(input.request.id, entry)
    publishPiEvent({
      directory: entry.directory,
      payload: {
        type: QUESTION_ASKED_EVENT,
        properties: input.request,
      },
    })
  })
}

function createPermissionPromise(input: {
  directory: string
  request: BuddyPermissionRequest
  defaultValue: BuddyPermissionResolution
  options?: ExtensionUIDialogOptions
}): Promise<BuddyPermissionResolution> {
  if (input.options?.signal?.aborted) {
    return Promise.resolve(input.defaultValue)
  }

  return new Promise<BuddyPermissionResolution>((resolve) => {
    const entry: PendingPermissionEntry = {
      directory: normalizeDirectoryKey(input.directory),
      request: input.request,
      resolve,
      ...(input.options?.signal ? { signal: input.options.signal } : {}),
    }

    if (input.options?.signal) {
      entry.abortListener = () => {
        finalizePermissionRequest(input.request.id, input.defaultValue)
      }
      input.options.signal.addEventListener("abort", entry.abortListener, { once: true })
    }

    if (typeof input.options?.timeout === "number" && input.options.timeout > 0) {
      entry.timeoutID = setTimeout(() => {
        finalizePermissionRequest(input.request.id, input.defaultValue)
      }, input.options.timeout)
    }

    pendingPermissions.set(input.request.id, entry)
    publishPiEvent({
      directory: entry.directory,
      payload: {
        type: PERMISSION_ASKED_EVENT,
        properties: input.request,
      },
    })
  })
}

function selectQuestionRequest(
  sessionID: string,
  title: string,
  options: string[],
): BuddyQuestionRequest {
  return {
    id: crypto.randomUUID(),
    sessionID,
    questions: [
      {
        question: title,
        header: headerFromTitle(title, DEFAULT_QUESTION_HEADER),
        options: options.map((option) => ({
          label: option,
          description: option,
        })),
      },
    ],
  }
}

function confirmQuestionRequest(
  sessionID: string,
  title: string,
  message: string,
): BuddyQuestionRequest {
  return {
    id: crypto.randomUUID(),
    sessionID,
    questions: [
      {
        question: `${title}\n\n${message}`.trim(),
        header: headerFromTitle(title, DEFAULT_CONFIRM_HEADER),
        options: [
          {
            label: CONFIRM_YES_LABEL,
            description: CONFIRM_YES_DESCRIPTION,
          },
          {
            label: CONFIRM_NO_LABEL,
            description: CONFIRM_NO_DESCRIPTION,
          },
        ],
      },
    ],
  }
}

function textEntryQuestionRequest(
  sessionID: string,
  title: string,
  placeholder: string | undefined,
  fallbackHeader: string,
): BuddyQuestionRequest {
  return {
    id: crypto.randomUUID(),
    sessionID,
    questions: [
      {
        question: placeholder ? `${title}\n\n${placeholder}` : title,
        header: headerFromTitle(title, fallbackHeader),
        options: [],
        custom: true,
      },
    ],
  }
}

function readFirstAnswer(answers: string[][]) {
  const firstQuestionAnswers = answers[0]
  const firstAnswer = firstQuestionAnswers?.[0]
  return isNonEmptyString(firstAnswer) ? firstAnswer : undefined
}

export function listPendingQuestionRequests(directory: string): BuddyQuestionRequest[] {
  const normalizedDirectory = normalizeDirectoryKey(directory)
  return Array.from(pendingQuestions.values())
    .filter((entry) => entry.directory === normalizedDirectory)
    .map((entry) => entry.request)
}

export function replyPendingQuestionRequest(
  directory: string,
  requestID: string,
  answers: string[][],
): boolean {
  const normalizedDirectory = normalizeDirectoryKey(directory)
  const entry = pendingQuestions.get(requestID)
  if (!entry || entry.directory !== normalizedDirectory) {
    return false
  }

  const firstAnswer = readFirstAnswer(answers)
  switch (entry.kind) {
    case "confirm":
      return finalizeQuestionRequest(
        requestID,
        firstAnswer === CONFIRM_YES_LABEL,
        QUESTION_REPLIED_EVENT,
      )
    case "select":
    case "input":
    case "editor":
      return finalizeQuestionRequest(requestID, firstAnswer, QUESTION_REPLIED_EVENT)
    case "question":
      return finalizeQuestionRequest(requestID, answers, QUESTION_REPLIED_EVENT)
  }
}

export function askBuddyPiQuestions(input: {
  directory: string
  sessionID: string
  questions: BuddyQuestionInfo[]
  tool?: { messageID: string; callID: string } | null
  options?: ExtensionUIDialogOptions
}): Promise<string[][]> {
  const request: BuddyQuestionRequest = {
    id: crypto.randomUUID(),
    sessionID: input.sessionID,
    questions: input.questions,
    tool: input.tool,
  }
  return createQuestionPromise<string[][]>({
    directory: input.directory,
    request,
    kind: "question",
    defaultValue: input.questions.map(() => []),
    options: input.options,
  })
}

export function rejectPendingQuestionRequest(directory: string, requestID: string): boolean {
  const normalizedDirectory = normalizeDirectoryKey(directory)
  const entry = pendingQuestions.get(requestID)
  if (!entry || entry.directory !== normalizedDirectory) {
    return false
  }

  return finalizeQuestionRequest(requestID, entry.defaultValue, QUESTION_REJECTED_EVENT)
}

export function listPendingPermissionRequests(directory: string): BuddyPermissionRequest[] {
  const normalizedDirectory = normalizeDirectoryKey(directory)
  return Array.from(pendingPermissions.values())
    .filter((entry) => entry.directory === normalizedDirectory)
    .map((entry) => entry.request)
}

export function replyPendingPermissionRequest(
  directory: string,
  requestID: string,
  reply: BuddyPermissionReply,
  message?: string,
): boolean {
  const normalizedDirectory = normalizeDirectoryKey(directory)
  const entry = pendingPermissions.get(requestID)
  if (!entry || entry.directory !== normalizedDirectory) {
    return false
  }

  return finalizePermissionRequest(requestID, {
    reply,
    ...(message?.trim() ? { message: message.trim() } : {}),
  })
}

export function createBuddyPiUiContext(input: {
  directory: string
  sessionID: string
}): ExtensionUIContext {
  return {
    select(title, options, dialogOptions) {
      const request = selectQuestionRequest(input.sessionID, title, options)
      return createQuestionPromise({
        directory: input.directory,
        request,
        kind: "select",
        defaultValue: undefined,
        options: dialogOptions,
      })
    },
    confirm(title, message, dialogOptions) {
      const request = confirmQuestionRequest(input.sessionID, title, message)
      return createQuestionPromise<boolean>({
        directory: input.directory,
        request,
        kind: "confirm",
        defaultValue: false,
        options: dialogOptions,
      }).then((value) => value === true)
    },
    input(title, placeholder, dialogOptions) {
      const request = textEntryQuestionRequest(
        input.sessionID,
        title,
        placeholder,
        DEFAULT_INPUT_HEADER,
      )
      return createQuestionPromise({
        directory: input.directory,
        request,
        kind: "input",
        defaultValue: undefined,
        options: dialogOptions,
      })
    },
    notify() {},
    onTerminalInput() {
      return () => {}
    },
    setStatus() {},
    setWorkingMessage() {},
    setWorkingVisible() {},
    setWorkingIndicator() {},
    setHiddenThinkingLabel() {},
    setWidget() {},
    setFooter() {},
    setHeader() {},
    setTitle() {},
    custom() {
      return Promise.reject(
        new Error("Custom extension UI is not supported in Buddy web sessions."),
      )
    },
    pasteToEditor() {},
    setEditorText() {},
    getEditorText() {
      return ""
    },
    editor(title, prefill) {
      const request = textEntryQuestionRequest(
        input.sessionID,
        title,
        prefill,
        DEFAULT_EDITOR_HEADER,
      )
      return createQuestionPromise({
        directory: input.directory,
        request,
        kind: "editor",
        defaultValue: undefined,
      })
    },
    addAutocompleteProvider() {},
    setEditorComponent() {},
    getEditorComponent() {
      return undefined
    },
    get theme(): never {
      throw new Error("Theme access is not supported in Buddy web sessions.")
    },
    getAllThemes() {
      return []
    },
    getTheme() {
      return undefined
    },
    setTheme() {
      return {
        success: false,
        error: "Theme switching is not supported in Buddy web sessions.",
      }
    },
    getToolsExpanded() {
      return true
    },
    setToolsExpanded() {},
  }
}

export async function requestBuddyPiPermission(input: {
  directory: string
  sessionID: string
  permission: string
  patterns: string[]
  always: string[]
  metadata?: Record<string, unknown>
  tool?: {
    messageID: string
    callID: string
  } | null
  options?: ExtensionUIDialogOptions
}) {
  const request: BuddyPermissionRequest = {
    id: crypto.randomUUID(),
    sessionID: input.sessionID,
    permission: input.permission,
    patterns: [...input.patterns],
    metadata: input.metadata ?? {},
    always: [...input.always],
    ...(input.tool !== undefined ? { tool: input.tool } : {}),
  }

  return createPermissionPromise({
    directory: input.directory,
    request,
    defaultValue: { reply: "reject" },
    options: input.options,
  })
}
