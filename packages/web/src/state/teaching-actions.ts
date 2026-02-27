import type { TeachingLanguage, TeachingWorkspace } from "./teaching-mode"

function directoryHeaderValue(directory: string) {
  const isNonASCII = /[^\x00-\x7F]/.test(directory)
  return isNonASCII ? encodeURIComponent(directory) : directory
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function requestJson<T>(
  directory: string,
  endpoint: string,
  init?: {
    method?: string
    body?: unknown
  },
) {
  const body = init?.body === undefined ? undefined : JSON.stringify(init.body)
  const response = await fetch(endpoint, {
    method: init?.method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      "x-buddy-directory": directoryHeaderValue(directory),
    },
    body,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | {
          error?: string
          message?: string
        }
      | undefined
    const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  return (await response.json()) as T
}

export type TeachingConflictPayload = {
  error: string
  revision: number
  code: string
  lessonFilePath: string
}

export class TeachingConflictError extends Error {
  payload: TeachingConflictPayload

  constructor(payload: TeachingConflictPayload) {
    super(payload.error)
    this.name = "TeachingConflictError"
    this.payload = payload
  }
}

export async function ensureTeachingWorkspace(input: {
  directory: string
  sessionID: string
  language?: TeachingLanguage
}) {
  return requestJson<TeachingWorkspace>(input.directory, `/api/teaching/session/${encodeURIComponent(input.sessionID)}/workspace`, {
    method: "POST",
    body: {
      language: input.language,
    },
  })
}

export async function loadTeachingWorkspace(input: { directory: string; sessionID: string }) {
  return requestJson<TeachingWorkspace>(input.directory, `/api/teaching/session/${encodeURIComponent(input.sessionID)}/workspace`)
}

export async function saveTeachingWorkspace(input: {
  directory: string
  sessionID: string
  code: string
  expectedRevision: number
  language?: TeachingLanguage
}) {
  const response = await fetch(`/api/teaching/session/${encodeURIComponent(input.sessionID)}/workspace`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-buddy-directory": directoryHeaderValue(input.directory),
    },
    body: JSON.stringify({
      code: input.code,
      expectedRevision: input.expectedRevision,
      language: input.language,
    }),
  })

  if (response.status === 409) {
    const payload = (await response.json()) as TeachingConflictPayload
    throw new TeachingConflictError(payload)
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  return (await response.json()) as TeachingWorkspace
}

export async function checkpointTeachingWorkspace(input: { directory: string; sessionID: string }) {
  return requestJson<{
    revision: number
    lessonFilePath: string
    checkpointFilePath: string
  }>(input.directory, `/api/teaching/session/${encodeURIComponent(input.sessionID)}/checkpoint`, {
    method: "POST",
  })
}

export async function restoreTeachingWorkspace(input: { directory: string; sessionID: string }) {
  return requestJson<TeachingWorkspace>(
    input.directory,
    `/api/teaching/session/${encodeURIComponent(input.sessionID)}/restore`,
    {
      method: "POST",
    },
  )
}

export { stringifyError }
