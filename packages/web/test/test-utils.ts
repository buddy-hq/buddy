import { useChatStore } from "../src/state/chat-store"
import { withFetchPreconnect, type FetchTransport } from "../src/lib/fetch-transport"
import type {
  AssistantMessageInfo,
  DirectoryChatState,
  MessagePart,
  MessageWithParts,
  ProviderInfo,
  ProviderMethodInfo,
  ProviderModelInfo,
  UserMessageInfo,
} from "../src/state/chat-types"

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createFetchStub(implementation: FetchStub): FetchTransport {
  return withFetchPreconnect(implementation, globalThis.fetch)
}

export function createDirectoryChatState(
  input: Partial<DirectoryChatState> = {},
): DirectoryChatState {
  const merged = {
    sessionTitle: "New thread",
    sessions: [],
    sessionStatusByID: {},
    messages: [],
    pendingPermissions: [],
    pendingQuestions: [],
    providers: [],
    providerDefault: {},
    mcpStatus: {},
    isBusy: false,
    isReady: false,
    ...input,
  }

  return {
    ...merged,
    pendingQuestions: merged.pendingQuestions ?? [],
  }
}

export function seedDirectoryChatState(directory: string, input: Partial<DirectoryChatState> = {}) {
  useChatStore.setState((state) => ({
    directories: {
      ...state.directories,
      [directory]: createDirectoryChatState(input),
    },
  }))
}

export function createUserMessageInfo(
  input: Pick<UserMessageInfo, "id" | "sessionID"> & Partial<UserMessageInfo>,
): UserMessageInfo {
  const { id, sessionID, role: _role, agent, model, time, ...rest } = input
  return {
    ...rest,
    id,
    sessionID,
    role: "user",
    agent: agent ?? "buddy",
    model: model ?? {
      providerID: "test",
      modelID: "test-model",
    },
    time: time ?? {
      created: 1,
    },
  }
}

export function createAssistantMessageInfo(
  input: Pick<AssistantMessageInfo, "id" | "sessionID"> & Partial<AssistantMessageInfo>,
): AssistantMessageInfo {
  const {
    id,
    sessionID,
    role: _role,
    parentID,
    providerID,
    modelID,
    mode,
    agent,
    path,
    variant,
    structured,
    summary,
    time,
    error,
    finish,
    tokens,
    cost,
    ...rest
  } = input
  return {
    ...rest,
    id,
    sessionID,
    role: "assistant",
    parentID: parentID ?? "parent-message",
    providerID: providerID ?? "test",
    modelID: modelID ?? "test-model",
    mode: mode ?? "buddy",
    agent: agent ?? "buddy",
    path: path ?? {
      cwd: "/repo",
      root: "/",
    },
    variant,
    structured,
    summary,
    time: time ?? {
      created: 1,
    },
    error,
    finish,
    tokens: tokens ?? {
      total: 0,
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    cost: cost ?? 0,
  }
}

export function createMessageWithParts(
  info: UserMessageInfo | AssistantMessageInfo,
  parts: MessagePart[] = [],
): MessageWithParts {
  return {
    info,
    parts,
  }
}

export function createProviderModelInfo(
  input: Pick<ProviderModelInfo, "id" | "providerID"> & Partial<ProviderModelInfo>,
): ProviderModelInfo {
  const {
    id,
    providerID,
    name,
    family,
    releaseDate,
    variants,
    status,
    limit,
    capabilities,
    ...rest
  } = input
  return {
    ...rest,
    id,
    providerID,
    name: name ?? id,
    family,
    releaseDate,
    variants: variants ?? [],
    status: status ?? "active",
    limit: limit ?? {
      context: 200_000,
      output: 16_384,
    },
    capabilities: capabilities ?? {
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: true,
        video: false,
        pdf: true,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
  }
}

export function createProviderInfo(
  input: Pick<ProviderInfo, "id"> &
    Partial<Omit<ProviderInfo, "id" | "methods" | "models">> & {
      methods?: ProviderMethodInfo[]
      models?: ProviderModelInfo[]
    },
): ProviderInfo {
  const { id, name, source, env, connected, methods, models, ...rest } = input
  return {
    ...rest,
    id,
    name: name ?? id,
    source: source ?? "config",
    env: env ?? [],
    connected: connected ?? false,
    methods: methods ?? [],
    models: models ?? [],
  }
}
