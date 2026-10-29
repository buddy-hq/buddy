import fs from "node:fs"
import path from "node:path"
import { RuntimeError } from "@buddy/agent-runtime/errors"
import type { Forms } from "@buddy/agent-runtime/forms"
import {
  isFormAlreadySettledError,
  isFormNotFoundError,
  isInvalidRequestError,
  type FormInfo,
} from "@opencode/client"
import { toBuddyQuestion, toFormAnswer } from "../gateway/form"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

function canonicalDirectory(directory: string): string {
  let current = directory
  const suffix: string[] = []
  while (true) {
    if (fs.existsSync(current)) {
      try {
        return path.join(fs.realpathSync.native(current), ...suffix.toReversed())
      } catch {
        return directory
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return directory
    suffix.push(path.basename(current))
    current = parent
  }
}

function sessionIsInsideDirectory(directory: string, sessionDirectory: string): boolean {
  const relative = path.relative(directory, canonicalDirectory(sessionDirectory))
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

async function listNotebookForms(host: OpenCodeHost, directory: string): Promise<FormInfo[]> {
  const forms: FormInfo[] = []
  const canonicalRoot = canonicalDirectory(directory)
  let cursor: string | undefined
  do {
    const sessions = await host.session.list({ directory, cursor })
    for (const session of sessions.data) {
      if (!sessionIsInsideDirectory(canonicalRoot, session.location.directory)) continue
      forms.push(...(await host.session.form.list({ sessionID: session.id })))
    }
    cursor = sessions.cursor.next ?? undefined
  } while (cursor !== undefined)
  return forms
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    const error = toRuntimeError(cause)
    if (cause instanceof RuntimeError) throw error
    if (isFormNotFoundError(cause))
      throw new RuntimeError("not_found", cause.message, { subject: "form", cause })
    if (isFormAlreadySettledError(cause))
      throw new RuntimeError("conflict", cause.message, { subject: "form", cause })
    if (error.kind === "internal" || (error.kind === "not_found" && error.subject === "session"))
      throw error
    if (error.kind === "invalid" && (error.subject === "form" || isInvalidRequestError(cause)))
      throw error
    throw new RuntimeError("internal", error.message, { subject: error.subject, cause })
  }
}

export function createForms(host: OpenCodeHost, _options: OpenCodeRuntimeOptions): Forms {
  async function pendingQuestion(sessionID: string, questionID: string): Promise<FormInfo> {
    const forms = await host.session.form.list({ sessionID })
    const form = forms.find((entry) => entry.id === questionID && toBuddyQuestion(entry))
    if (form === undefined)
      throw new RuntimeError("not_found", "Question not found", { subject: "form" })
    return form
  }

  return {
    pending(scope) {
      return request(async () => {
        const forms =
          "sessionID" in scope
            ? await host.session.form.list({ sessionID: scope.sessionID })
            : await listNotebookForms(host, scope.directory)
        return forms.flatMap((form) => {
          const question = toBuddyQuestion(form)
          return question === undefined ? [] : [question]
        })
      })
    },
    answer(sessionID, questionID, answers) {
      return request(async () => {
        const form = await pendingQuestion(sessionID, questionID)
        const answer = toFormAnswer(form, answers)
        if (!answer.ok) throw new RuntimeError("invalid", answer.error, { subject: "form" })
        await host.session.form.reply({
          sessionID: form.sessionID,
          formID: form.id,
          answer: answer.answer,
        })
      })
    },
    dismiss(sessionID, questionID) {
      return request(async () => {
        const form = await pendingQuestion(sessionID, questionID)
        await host.session.form.cancel({ sessionID: form.sessionID, formID: form.id })
      })
    },
  }
}
