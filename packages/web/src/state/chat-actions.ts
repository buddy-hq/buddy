import { useChatStore } from "./chat-store"
import type {
  ConfigProvidersResponse,
  MessageWithParts,
  PermissionRequest,
  SessionInfo,
} from "./chat-types"
import type { TeachingPromptContext } from "./teaching-mode"

const POST_PROMPT_RESYNC_INTERVAL_MS = 250
const POST_PROMPT_RESYNC_ATTEMPTS = 600

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

export type AgentConfigOption = {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden?: boolean
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
      | { error?: string; message?: string }
      | undefined
    const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  return (await response.json()) as T
}

export async function loadSessions(directory: string) {
  const store = useChatStore.getState()
  try {
    const query = new URLSearchParams({ directory })
    const sessions = await requestJson<SessionInfo[]>(directory, `/api/session?${query.toString()}`)
    store.setSessions(directory, sessions)
    store.setDirectoryError(directory, undefined)
    return sessions
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function loadMessages(directory: string, sessionID: string) {
  const store = useChatStore.getState()
  try {
    const messages = await requestJson<MessageWithParts[]>(
      directory,
      `/api/session/${encodeURIComponent(sessionID)}/message`,
    )
    store.setMessages(directory, sessionID, messages)
    store.setDirectoryError(directory, undefined)
    return messages
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function loadPermissions(directory: string) {
  const store = useChatStore.getState()
  try {
    const query = new URLSearchParams({ directory })
    const requests = await requestJson<PermissionRequest[]>(directory, `/api/permission?${query.toString()}`)
    store.setPendingPermissions(directory, requests)
    store.setDirectoryError(directory, undefined)
    return requests
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function loadProviders(directory: string) {
  const store = useChatStore.getState()
  try {
    const providers = await requestJson<ConfigProvidersResponse>(directory, "/api/config/providers")
    store.setProviders(directory, providers)
    store.setDirectoryError(directory, undefined)
    return providers
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

async function createSession(directory: string) {
  const store = useChatStore.getState()
  const info = await requestJson<SessionInfo>(directory, "/api/session", { method: "POST" })
  store.setSessionInfo(directory, info)
  store.setMessages(directory, info.id, [])
  return info
}

export async function ensureDirectorySession(directory: string) {
  const store = useChatStore.getState()
  store.ensureProject(directory)
  store.setDirectoryReady(directory, false)
  store.clearDirectoryError(directory)

  const current = store.directories[directory]
  const storedSession = current?.sessionID ?? store.lastSessionByDirectory[directory]

  try {
    const sessions = await loadSessions(directory)
    const sessionByID = new Map(sessions.map((session) => [session.id, session]))

    let info: SessionInfo | undefined
    if (storedSession && sessionByID.has(storedSession)) {
      info = sessionByID.get(storedSession)
    }

    if (!info) {
      info = sessions[0]
    }

    if (!info && storedSession) {
      info = await requestJson<SessionInfo>(
        directory,
        `/api/session/${encodeURIComponent(storedSession)}`,
      ).catch(() => undefined)
    }

    if (!info) {
      info = await createSession(directory)
      void loadSessions(directory).catch(() => undefined)
    } else {
      store.setSessionInfo(directory, info)
    }

    await loadMessages(directory, info.id)
    await loadPermissions(directory)
    await loadProviders(directory)
    store.setDirectoryReady(directory, true)
    return info
  } catch (error) {
    store.setDirectoryReady(directory, true)
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function selectSession(directory: string, sessionID: string) {
  const store = useChatStore.getState()
  const current = store.directories[directory]
  const existing = current?.sessions.find((session) => session.id === sessionID)

  if (existing) {
    store.setSessionInfo(directory, existing)
  } else {
    const info = await requestJson<SessionInfo>(directory, `/api/session/${encodeURIComponent(sessionID)}`)
    store.setSessionInfo(directory, info)
  }

  await loadMessages(directory, sessionID)
}

export async function startNewSession(directory: string) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  const info = await createSession(directory)
  void loadSessions(directory).catch(() => undefined)
  await loadMessages(directory, info.id)
  return info
}

export async function sendPrompt(
  directory: string,
  content: string,
  input?: {
    agent?: string
    teaching?: TeachingPromptContext
  },
) {
  const store = useChatStore.getState()
  const state = store.directories[directory]
  const sessionID = state?.sessionID
  if (!sessionID) {
    throw new Error("No session available")
  }

  store.clearDirectoryError(directory)
  store.applySessionStatus(directory, sessionID, "busy")

  let promptRequestSettled = false
  const canCompletePolling = () => promptRequestSettled
  try {
    console.info("[chat-action] prompt.start", {
      directory,
      contentLength: content.length,
      sessionID,
    })

    const promptRequest = requestJson<MessageWithParts>(
      directory,
      `/api/session/${encodeURIComponent(sessionID)}/message`,
      {
        method: "POST",
        body: {
          content,
          ...(input?.agent ? { agent: input.agent } : {}),
          ...(input?.teaching ? { teaching: input.teaching } : {}),
        },
      },
    ).finally(() => {
      promptRequestSettled = true
    })

    void pollPromptCompletion(directory, sessionID, canCompletePolling)
    await promptRequest

    console.info("[chat-action] prompt.accepted", { directory, sessionID })
  } catch (error) {
    console.error("[chat-action] prompt.failed", {
      directory,
      sessionID,
      error: stringifyError(error),
    })
    store.applySessionStatus(directory, sessionID, "idle")
    store.setDirectoryError(directory, stringifyError(error))
    void loadMessages(directory, sessionID).catch(() => undefined)
    void loadSessions(directory).catch(() => undefined)
    throw error
  }
}

export async function abortPrompt(directory: string) {
  const store = useChatStore.getState()
  const state = store.directories[directory]
  const sessionID = state?.sessionID
  if (!sessionID) {
    return false
  }

  try {
    const aborted = await requestJson<boolean>(
      directory,
      `/api/session/${encodeURIComponent(sessionID)}/abort`,
      {
        method: "POST",
      },
    )
    if (aborted) store.applySessionStatus(directory, sessionID, "idle")
    // Always resync once after abort attempt so UI doesn't stay stale if server state drifted.
    void loadMessages(directory, sessionID).catch(() => undefined)
    void loadSessions(directory).catch(() => undefined)
    return aborted
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function resyncDirectory(directory: string) {
  const store = useChatStore.getState()
  const sessionID = store.directories[directory]?.sessionID
  await loadSessions(directory)
  await loadPermissions(directory)
  await loadProviders(directory)
  if (!sessionID) return
  await loadMessages(directory, sessionID)
}

export async function replyPermission(input: {
  directory: string
  requestID: string
  reply: "once" | "always" | "reject"
  message?: string
}) {
  const response = await fetch(`/api/permission/${encodeURIComponent(input.requestID)}/reply`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-buddy-directory": directoryHeaderValue(input.directory),
    },
    body: JSON.stringify({
      reply: input.reply,
      message: input.message,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: string; message?: string }
      | undefined
    const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  const result = (await response.json()) as boolean
  if (result) {
    useChatStore.getState().applyPermissionReplied(input.directory, input.requestID)
  }
  return result
}

export async function updateSession(input: {
  directory: string
  sessionID: string
  title?: string
  archivedAt?: number
}) {
  const store = useChatStore.getState()
  const payload: {
    title?: string
    time?: {
      archived?: number
    }
  } = {}

  if (input.title !== undefined) {
    payload.title = input.title
  }

  if (input.archivedAt !== undefined) {
    payload.time = {
      archived: input.archivedAt,
    }
  }

  try {
    const response = await fetch(`/api/session/${encodeURIComponent(input.sessionID)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-buddy-directory": directoryHeaderValue(input.directory),
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
      const message = result?.error ?? result?.message ?? `Request failed (${response.status})`
      throw new Error(message)
    }

    const session = (await response.json()) as SessionInfo
    store.setDirectoryError(input.directory, undefined)
    return session
  } catch (error) {
    store.setDirectoryError(input.directory, stringifyError(error))
    throw error
  }
}

export async function loadCurriculum(directory: string) {
  const response = await fetch("/api/curriculum", {
    headers: {
      "x-buddy-directory": directoryHeaderValue(directory),
    },
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(result?.error ?? result?.message ?? `Request failed (${response.status})`)
  }

  const payload = (await response.json()) as { markdown: string }
  return payload.markdown
}

export async function saveCurriculum(directory: string, markdown: string) {
  const response = await fetch("/api/curriculum", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-buddy-directory": directoryHeaderValue(directory),
    },
    body: JSON.stringify({ markdown }),
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(result?.error ?? result?.message ?? `Request failed (${response.status})`)
  }

  const payload = (await response.json()) as { markdown: string }
  return payload.markdown
}

export async function loadProjectConfig(directory: string) {
  return requestJson<Record<string, unknown>>(directory, "/api/config")
}

export async function patchProjectConfig(directory: string, patch: Record<string, unknown>) {
  const response = await fetch("/api/config", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-buddy-directory": directoryHeaderValue(directory),
    },
    body: JSON.stringify(patch),
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(result?.error ?? result?.message ?? `Request failed (${response.status})`)
  }

  return (await response.json()) as Record<string, unknown>
}

export async function loadProviderCatalog(directory: string) {
  return requestJson<ConfigProvidersResponse>(directory, "/api/config/providers")
}

export async function loadAgentCatalog(directory: string) {
  return requestJson<AgentConfigOption[]>(directory, "/api/config/agents")
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function pollPromptCompletion(directory: string, sessionID: string, canComplete: () => boolean = () => true) {
  for (let attempt = 1; attempt <= POST_PROMPT_RESYNC_ATTEMPTS; attempt += 1) {
    await sleep(POST_PROMPT_RESYNC_INTERVAL_MS)
    const snapshot = useChatStore.getState().directories[directory]
    if (!snapshot) return
    if (snapshot.sessionID !== sessionID) return

    try {
      await loadMessages(directory, sessionID)
    } catch (error) {
      console.warn("[chat-action] prompt.resync.failed", {
        directory,
        sessionID,
        attempt,
        error: stringifyError(error),
      })
      continue
    }

    const next = useChatStore.getState().directories[directory]
    if (!next) return
    if (next.sessionID !== sessionID) return
    if (!next.isBusy) {
      if (!canComplete() || attempt < 2) {
        useChatStore.getState().applySessionStatus(directory, sessionID, "busy")
        continue
      }
      console.info("[chat-action] prompt.resync.completed", {
        directory,
        sessionID,
        attempt,
      })
      void loadSessions(directory).catch(() => undefined)
      return
    }
  }

  console.warn("[chat-action] prompt.resync.timeout", {
    directory,
    sessionID,
    attempts: POST_PROMPT_RESYNC_ATTEMPTS,
  })
}
