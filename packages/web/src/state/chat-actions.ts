import type { ProviderAuthMethod, ProviderAuthResponse, ProviderListResponse } from "@opencode-ai/sdk/v2/client"
import { useChatStore } from "./chat-store"
import type {
  MessageWithParts,
  McpStatusMap,
  PermissionRequest,
  ProviderCatalogState,
  ProviderInfo,
  SessionInfo,
} from "./chat-types"
import type { TeachingPromptContext } from "./teaching-mode"
import { apiFetch, requestJson, stringifyError } from "../lib/api-client"
import { getOpenCodeClient } from "../lib/opencode-client"
import type { PromptAttachmentPart, PromptFilePart } from "../components/prompt/prompt-types"

export type AgentConfigOption = {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden?: boolean
}

export type ModeConfigOption = {
  id: string
  label: string
  description?: string
  surfaces: Array<"curriculum" | "editor" | "figure">
  defaultSurface: "curriculum" | "editor" | "figure"
  hidden?: boolean
}

export type PromptCommandOption = {
  name: string
  description?: string
  source?: "command" | "mcp" | "skill"
}

const BUDDY_MODE_DEFAULT_ORDER = ["buddy", "code-buddy", "math-buddy"] as const

function normalizeProjectDirectory(directory: string) {
  const normalized = directory.trim().replace(/\/+$/, "")
  if (!normalized || normalized === "/") {
    return undefined
  }
  return normalized
}

export function resolveDefaultModeID(
  modes: ModeConfigOption[],
  configuredDefaultMode?: string,
): string | undefined {
  const selectableModes = modes.filter((mode) => !mode.hidden)

  if (configuredDefaultMode && selectableModes.some((mode) => mode.id === configuredDefaultMode)) {
    return configuredDefaultMode
  }

  for (const modeID of BUDDY_MODE_DEFAULT_ORDER) {
    if (selectableModes.some((mode) => mode.id === modeID)) {
      return modeID
    }
  }

  return selectableModes[0]?.id
}

type RawProvider = ProviderListResponse["all"][number]
type RawProviderModel = RawProvider["models"][string]
type OpenProjectResult = {
  directory: string
}

function normalizeProviderSource(input: unknown, connected: boolean): ProviderInfo["source"] {
  if (input === "env" || input === "config" || input === "custom" || input === "api") {
    return input
  }
  return connected ? "api" : "custom"
}

function normalizeProviderModel(providerID: string, input: RawProviderModel): ProviderInfo["models"][number] {
  return {
    id: input.id,
    providerID,
    name: input.name,
    family: input.family,
    releaseDate: input.release_date,
    variants: Object.keys(input.variants ?? {}).sort((a, b) => a.localeCompare(b)),
    status: input.status ?? "active",
    limit: {
      context: input.limit.context,
      input: input.limit.input,
      output: input.limit.output,
    },
    capabilities: {
      reasoning: input.reasoning,
      attachment: input.attachment,
      toolcall: input.tool_call,
      input: {
        text: input.modalities?.input.includes("text") ?? false,
        audio: input.modalities?.input.includes("audio") ?? false,
        image: input.modalities?.input.includes("image") ?? false,
        video: input.modalities?.input.includes("video") ?? false,
        pdf: input.modalities?.input.includes("pdf") ?? false,
      },
      output: {
        text: input.modalities?.output.includes("text") ?? false,
        audio: input.modalities?.output.includes("audio") ?? false,
        image: input.modalities?.output.includes("image") ?? false,
        video: input.modalities?.output.includes("video") ?? false,
        pdf: input.modalities?.output.includes("pdf") ?? false,
      },
      interleaved: input.interleaved ?? false,
    },
  }
}

function normalizeProviderCatalog(
  providers: ProviderListResponse,
  authMethods: ProviderAuthResponse,
): ProviderCatalogState {
  const connected = new Set(providers.connected)

  return {
    default: providers.default,
    providers: providers.all
      .map((provider) => {
        const isConnected = connected.has(provider.id)
        const source = normalizeProviderSource((provider as { source?: unknown }).source, isConnected)

        return {
          id: provider.id,
          name: provider.name,
          source,
          env: provider.env,
          connected: isConnected,
          methods: (authMethods[provider.id] ?? []).map((method: ProviderAuthMethod) => ({
            type: method.type,
            label: method.label,
          })),
          models: Object.values(provider.models)
            .filter((model) => model.status !== "deprecated")
            .map((model) => normalizeProviderModel(provider.id, model))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function fetchProviderCatalog(directory: string) {
  const client = getOpenCodeClient(directory)
  const [providerResult, authResult] = await Promise.all([
    client.provider.list(undefined, { throwOnError: true }),
    client.provider.auth(undefined, { throwOnError: true }),
  ])

  return normalizeProviderCatalog(providerResult.data!, authResult.data ?? {})
}

export async function loadOpenProjects() {
  const store = useChatStore.getState()
  const knownOpenProjects = store.openProjects.reduce<string[]>((all, project) => {
    const directory = normalizeProjectDirectory(project)
    if (directory) {
      all.push(directory)
    }
    return all
  }, [])

  store.setOpenProjects(knownOpenProjects)
  return useChatStore.getState().openProjects
}

export async function openProject(directory: string) {
  const normalized = normalizeProjectDirectory(directory)
  if (!normalized) {
    throw new Error("Please choose a notebook directory, not /")
  }

  const opened = await requestJson<OpenProjectResult>("", "/api/project", {
    method: "POST",
    body: {
      directory: normalized,
    },
  })
  const canonicalDirectory = normalizeProjectDirectory(opened.directory)

  if (!canonicalDirectory) {
    throw new Error("Invalid notebook directory")
  }

  useChatStore.getState().ensureOpenProject(canonicalDirectory)
  return canonicalDirectory
}

export async function preloadProjectSessions(directories: string[]) {
  const unique = Array.from(
    new Set(directories.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean)),
  ) as string[]
  await Promise.all(
    unique.map((directory) =>
      loadSessions(directory).catch((error) => {
        if (stringifyError(error).includes("Directory is outside allowed roots")) {
          useChatStore.getState().closeProject(directory)
        }
      }),
    ),
  )
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

export async function loadProviderCatalog(directory: string) {
  const store = useChatStore.getState()
  try {
    const providers = await fetchProviderCatalog(directory)
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
  const normalizedDirectory = normalizeProjectDirectory(directory) ?? directory
  store.setDirectoryReady(normalizedDirectory, false)
  store.clearDirectoryError(normalizedDirectory)

  try {
    const knownOpenProjects = store.openProjects
    const targetDirectory = knownOpenProjects.includes(normalizedDirectory)
      ? normalizedDirectory
      : await openProject(normalizedDirectory)
    const state = useChatStore.getState()
    const current = state.directories[targetDirectory]
    const storedSession = current?.sessionID ?? state.lastSessionByDirectory[targetDirectory]
    const sessions = await loadSessions(targetDirectory)
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
        targetDirectory,
        `/api/session/${encodeURIComponent(storedSession)}`,
      ).catch(() => undefined)
    }

    if (!info) {
      info = await createSession(targetDirectory)
      void loadSessions(targetDirectory).catch(() => undefined)
    } else {
      store.setSessionInfo(targetDirectory, info)
    }

    await loadMessages(targetDirectory, info.id)
    await loadPermissions(targetDirectory)
    await loadProviderCatalog(targetDirectory)
    await loadMcpStatus(targetDirectory).catch(() => undefined)
    store.setDirectoryReady(targetDirectory, true)
    return {
      directory: targetDirectory,
      info,
    }
  } catch (error) {
    const isOutsideAllowedRoots = stringifyError(error).includes("Directory is outside allowed roots")
    if (isOutsideAllowedRoots && useChatStore.getState().openProjects.includes(normalizedDirectory)) {
      store.closeProject(normalizedDirectory)
    }
    store.setDirectoryReady(normalizedDirectory, true)
    store.setDirectoryError(normalizedDirectory, stringifyError(error))
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
    parts?: PromptAttachmentPart[]
    mode?: string
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    variant?: string
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

  try {
    console.info("[chat-action] prompt.start", {
      directory,
      contentLength: content.length,
      sessionID,
    })

    await requestJson<MessageWithParts>(
      directory,
      `/api/session/${encodeURIComponent(sessionID)}/message`,
      {
        method: "POST",
        body: {
          content,
          ...(input?.parts && input.parts.length > 0 ? { parts: input.parts } : {}),
          ...(input?.mode ? { mode: input.mode } : {}),
          ...(input?.agent ? { agent: input.agent } : {}),
          ...(input?.model ? { model: input.model } : {}),
          ...(input?.variant ? { variant: input.variant } : {}),
          ...(input?.teaching ? { teaching: input.teaching } : {}),
        },
      },
    )

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

export async function sendCommand(
  directory: string,
  command: string,
  argumentsText: string,
  input?: {
    parts?: PromptFilePart[]
    mode?: string
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    variant?: string
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

  try {
    await requestJson<MessageWithParts>(
      directory,
      `/api/session/${encodeURIComponent(sessionID)}/command`,
      {
        method: "POST",
        body: {
          command,
          arguments: argumentsText,
          ...(input?.parts && input.parts.length > 0 ? { parts: input.parts } : {}),
          ...(input?.mode ? { mode: input.mode } : {}),
          ...(input?.agent ? { agent: input.agent } : {}),
          ...(input?.model
            ? { model: `${input.model.providerID}/${input.model.modelID}` }
            : {}),
          ...(input?.variant ? { variant: input.variant } : {}),
        },
      },
    )
  } catch (error) {
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
  await loadProviderCatalog(directory)
  await loadMcpStatus(directory).catch(() => undefined)
  if (!sessionID) return
  if (shouldDeferTranscriptReload(directory, sessionID)) return
  await loadMessages(directory, sessionID)
}

export async function replyPermission(input: {
  directory: string
  requestID: string
  reply: "once" | "always" | "reject"
  message?: string
}) {
  const response = await apiFetch(`/api/permission/${encodeURIComponent(input.requestID)}/reply`, {
    method: "POST",
    directory: input.directory,
    body: {
      reply: input.reply,
      message: input.message,
    },
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
    const response = await apiFetch(`/api/session/${encodeURIComponent(input.sessionID)}`, {
      method: "PATCH",
      directory: input.directory,
      body: payload,
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
  const response = await apiFetch("/api/curriculum", {
    directory,
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(result?.error ?? result?.message ?? `Request failed (${response.status})`)
  }

  const payload = (await response.json()) as { markdown: string }
  return payload.markdown
}

export async function loadGoalsInspector(directory: string) {
  const response = await apiFetch("/api/goals", {
    directory,
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(result?.error ?? result?.message ?? `Request failed (${response.status})`)
  }

  return (await response.json()) as {
    path: string
    raw: string | null
  }
}

export async function saveCurriculum(directory: string, markdown: string) {
  const response = await apiFetch("/api/curriculum", {
    method: "PUT",
    directory,
    body: { markdown },
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
  const response = await apiFetch("/api/config", {
    method: "PATCH",
    directory,
    body: patch,
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(result?.error ?? result?.message ?? `Request failed (${response.status})`)
  }

  return (await response.json()) as Record<string, unknown>
}

export async function saveProjectMcpConfig(directory: string, name: string, config: Record<string, unknown>) {
  const response = await apiFetch(`/api/config/mcp/${encodeURIComponent(name)}`, {
    method: "PUT",
    directory,
    body: config,
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(result?.error ?? result?.message ?? `Request failed (${response.status})`)
  }

  return (await response.json()) as Record<string, unknown>
}

export async function loadAgentCatalog(directory: string) {
  return requestJson<AgentConfigOption[]>(directory, "/api/config/agents")
}

export async function loadModeCatalog(directory: string) {
  return requestJson<ModeConfigOption[]>(directory, "/api/config/modes")
}

export async function loadCommandCatalog(directory: string) {
  return requestJson<PromptCommandOption[]>(directory, "/api/command")
}

export async function loadMcpStatus(directory: string) {
  const store = useChatStore.getState()
  const status = await requestJson<McpStatusMap>(directory, "/api/mcp")
  store.setMcpStatus(directory, status)
  return status
}

export async function connectMcpServer(directory: string, name: string) {
  await requestJson<boolean>(directory, `/api/mcp/${encodeURIComponent(name)}/connect`, {
    method: "POST",
  })
  return loadMcpStatus(directory)
}

export async function disconnectMcpServer(directory: string, name: string) {
  await requestJson<boolean>(directory, `/api/mcp/${encodeURIComponent(name)}/disconnect`, {
    method: "POST",
  })
  return loadMcpStatus(directory)
}

export async function authenticateMcpServer(directory: string, name: string) {
  await requestJson<{ status: string; error?: string }>(directory, `/api/mcp/${encodeURIComponent(name)}/auth/authenticate`, {
    method: "POST",
  })
  return loadMcpStatus(directory)
}

export async function findWorkspaceFiles(
  directory: string,
  query: string,
  input?: {
    includeDirectories?: boolean
    limit?: number
  },
) {
  const search = query.trim()
  if (!search) return [] as string[]

  const includeDirectories = input?.includeDirectories ?? true
  const client = getOpenCodeClient(directory)
  const response = await client.find.files(
    {
      query: search,
      dirs: includeDirectories ? "true" : "false",
      limit: input?.limit ?? 20,
    },
    { throwOnError: true },
  )

  return (response.data ?? []) as string[]
}

export function shouldDeferTranscriptReload(directory: string, sessionID?: string) {
  const state = useChatStore.getState()
  const snapshot = state.directories[directory]
  if (!snapshot?.isBusy) return false
  if (state.streamStatus !== "connected") return false
  if (sessionID && snapshot.sessionID !== sessionID) return false
  return true
}
