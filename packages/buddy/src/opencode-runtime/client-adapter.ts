import type { OpencodeClient } from "@opencode-ai/sdk/client"
import { fetchInProcessOpenCode } from "./in-process-fetch"

type DirectoryParams = {
  directory?: string
}

type SdkResult<T> = {
  data?: T
  error?: unknown
  response?: Response
}

function directoryQuery(params: DirectoryParams = {}) {
  return params.directory ? { query: { directory: params.directory } } : {}
}

function sessionPathParams(
  input: { sessionID: string; directory?: string; [key: string]: unknown },
  options?: { includeBody?: boolean },
) {
  const { sessionID, directory, ...rest } = input
  const includeBody = options?.includeBody ?? true
  const bodyEntries = includeBody
    ? Object.entries(rest).filter(([, value]) => value !== undefined)
    : []

  return {
    path: { id: sessionID },
    ...(directory ? { query: { directory } } : {}),
    ...(bodyEntries.length > 0 ? { body: Object.fromEntries(bodyEntries) } : {}),
  }
}

function namedPathParams(
  input: { name: string; directory?: string; [key: string]: unknown },
  key = "name",
) {
  const { name, directory, ...rest } = input
  const bodyEntries = Object.entries(rest).filter(([, value]) => value !== undefined)

  return {
    path: { [key]: name },
    ...(directory ? { query: { directory } } : {}),
    ...(bodyEntries.length > 0 ? { body: Object.fromEntries(bodyEntries) } : {}),
  }
}

function providerPathParams(input: {
  providerID: string
  directory?: string
  [key: string]: unknown
}) {
  const { providerID, directory, ...rest } = input
  const bodyEntries = Object.entries(rest).filter(([, value]) => value !== undefined)

  return {
    path: { id: providerID },
    ...(directory ? { query: { directory } } : {}),
    ...(bodyEntries.length > 0 ? { body: Object.fromEntries(bodyEntries) } : {}),
  }
}

async function fetchSdkRoute<T>(input: {
  directory?: string
  method?: string
  path: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
}): Promise<SdkResult<T>> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const response = await fetchInProcessOpenCode({
    directory: input.directory,
    method: input.method,
    path: input.path,
    query: params.size > 0 ? params.toString() : undefined,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    headers: input.body !== undefined ? { "content-type": "application/json" } : undefined,
  })

  if (response.ok) {
    const data = (await response.json().catch(() => undefined)) as T | undefined
    return { data, response }
  }

  const error = await response.json().catch(() => ({ message: response.statusText }))
  return { error, response }
}

export function createBuddyOpenCodeClient(raw: OpencodeClient) {
  return {
    global: {
      health: () => fetchSdkRoute({ path: "/global/health" }),
      dispose: () => fetchSdkRoute({ method: "POST", path: "/global/dispose" }),
      event: raw.global.event.bind(raw.global),
    },
    app: {
      agents: (params: DirectoryParams = {}) => raw.app.agents(directoryQuery(params)),
    },
    project: {
      current: (params: DirectoryParams = {}) => raw.project.current(directoryQuery(params)),
    },
    config: {
      providers: (params: DirectoryParams = {}) => raw.config.providers(directoryQuery(params)),
    },
    provider: {
      list: (params: DirectoryParams = {}) => raw.provider.list(directoryQuery(params)),
      auth: (params: DirectoryParams = {}) => raw.provider.auth(directoryQuery(params)),
      oauth: {
        authorize: (params: { providerID: string; method: number; directory?: string }) =>
          raw.provider.oauth.authorize({
            path: { id: params.providerID },
            ...(params.directory ? { query: { directory: params.directory } } : {}),
            body: { method: params.method },
          } as never),
        callback: (params: {
          providerID: string
          method: number
          code?: string
          directory?: string
        }) =>
          raw.provider.oauth.callback({
            ...providerPathParams(params),
            body: { method: params.method, code: params.code ?? "" },
          } as never),
        cancel: (params: { providerID: string; directory?: string }) =>
          fetchSdkRoute({
            directory: params.directory,
            method: "POST",
            path: `/provider/${encodeURIComponent(params.providerID)}/oauth/cancel`,
            query: params.directory ? { directory: params.directory } : undefined,
          }),
      },
    },
    find: {
      files: (params: {
        directory?: string
        query: string
        dirs?: "true" | "false"
        type?: string
        limit?: number
      }) =>
        raw.find.files({
          query: {
            directory: params.directory,
            query: params.query,
            dirs: params.dirs,
            ...(params.type ? { type: params.type } : {}),
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
          },
        } as never),
    },
    file: {
      list: (params: { directory?: string; path: string }) =>
        raw.file.list({
          query: {
            directory: params.directory,
            path: params.path,
          },
        }),
      read: (params: { directory?: string; path: string }) =>
        raw.file.read({
          query: {
            directory: params.directory,
            path: params.path,
          },
        }),
    },
    command: {
      list: (params: DirectoryParams = {}) => raw.command.list(directoryQuery(params)),
    },
    auth: {
      set: (params: { providerID: string; auth: unknown }) =>
        fetchSdkRoute({
          method: "PUT",
          path: `/auth/${encodeURIComponent(params.providerID)}`,
          body: params.auth,
        }),
      remove: (params: { providerID: string }) =>
        fetchSdkRoute({
          method: "DELETE",
          path: `/auth/${encodeURIComponent(params.providerID)}`,
        }),
    },
    permission: {
      list: (params: DirectoryParams = {}) =>
        fetchSdkRoute({
          directory: params.directory,
          path: "/permission",
          query: params.directory ? { directory: params.directory } : undefined,
        }),
      reply: (params: {
        requestID: string
        reply: "once" | "always" | "reject"
        message?: string
        directory?: string
      }) =>
        fetchSdkRoute({
          directory: params.directory,
          method: "POST",
          path: `/permission/${encodeURIComponent(params.requestID)}/reply`,
          query: params.directory ? { directory: params.directory } : undefined,
          body: {
            reply: params.reply,
            ...(params.message ? { message: params.message } : {}),
          },
        }),
    },
    question: {
      list: (params: DirectoryParams = {}) =>
        fetchSdkRoute({
          directory: params.directory,
          path: "/question",
          query: params.directory ? { directory: params.directory } : undefined,
        }),
      reply: (params: { requestID: string; answers: string[][]; directory?: string }) =>
        fetchSdkRoute({
          directory: params.directory,
          method: "POST",
          path: `/question/${encodeURIComponent(params.requestID)}/reply`,
          query: params.directory ? { directory: params.directory } : undefined,
          body: { answers: params.answers },
        }),
      reject: (params: { requestID: string; directory?: string }) =>
        fetchSdkRoute({
          directory: params.directory,
          method: "POST",
          path: `/question/${encodeURIComponent(params.requestID)}/reject`,
          query: params.directory ? { directory: params.directory } : undefined,
        }),
    },
    mcp: {
      status: (params: DirectoryParams = {}) => raw.mcp.status(directoryQuery(params)),
      add: (params: { name?: string; config: unknown; directory?: string }) => {
        const { directory, name, config } = params
        return raw.mcp.add({
          ...directoryQuery({ directory }),
          body: {
            ...(name !== undefined ? { name } : {}),
            config,
          },
        } as never)
      },
      connect: (params: { name: string; directory?: string }) =>
        raw.mcp.connect(namedPathParams(params) as never),
      disconnect: (params: { name: string; directory?: string }) =>
        raw.mcp.disconnect(namedPathParams(params) as never),
      auth: {
        start: (params: { name: string; directory?: string }) =>
          raw.mcp.auth.start(namedPathParams(params) as never),
        callback: (params: { name: string; code: string; directory?: string }) =>
          raw.mcp.auth.callback(namedPathParams(params) as never),
        authenticate: (params: { name: string; directory?: string }) =>
          raw.mcp.auth.authenticate(namedPathParams(params) as never),
        remove: (params: { name: string; directory?: string }) =>
          raw.mcp.auth.remove(namedPathParams(params) as never),
      },
    },
    session: {
      create: (params: {
        directory?: string
        parentID?: string
        title?: string
        [key: string]: unknown
      }) => {
        const { directory, ...rest } = params
        const bodyEntries = Object.entries(rest).filter(([, value]) => value !== undefined)
        return raw.session.create({
          ...directoryQuery({ directory }),
          ...(bodyEntries.length > 0 ? { body: Object.fromEntries(bodyEntries) } : {}),
        })
      },
      list: (params: Record<string, string | number | boolean | undefined> = {}) =>
        raw.session.list({ query: params } as never),
      status: (params: DirectoryParams = {}) => raw.session.status(directoryQuery(params)),
      get: (params: { sessionID: string; directory?: string }) =>
        raw.session.get(sessionPathParams(params, { includeBody: false }) as never),
      update: (params: { sessionID: string; directory?: string; [key: string]: unknown }) =>
        raw.session.update(sessionPathParams(params) as never),
      summarize: (params: { sessionID: string; directory?: string; [key: string]: unknown }) =>
        raw.session.summarize(sessionPathParams(params) as never),
      revert: (params: { sessionID: string; directory?: string; [key: string]: unknown }) =>
        raw.session.revert(sessionPathParams(params) as never),
      unrevert: (params: { sessionID: string; directory?: string }) =>
        raw.session.unrevert(sessionPathParams(params, { includeBody: false }) as never),
      abort: (params: { sessionID: string; directory?: string }) =>
        raw.session.abort(sessionPathParams(params, { includeBody: false }) as never),
      promptAsync: (params: { sessionID: string; directory?: string; [key: string]: unknown }) =>
        raw.session.promptAsync(sessionPathParams(params) as never),
      prompt: (
        params: { sessionID: string; directory?: string; [key: string]: unknown },
        options?: { parseAs?: "stream" | "json" },
      ) => raw.session.prompt({ ...sessionPathParams(params), ...options } as never),
      command: (params: { sessionID: string; directory?: string; [key: string]: unknown }) =>
        raw.session.command(sessionPathParams(params) as never),
    },
  }
}

export type BuddyOpenCodeClient = ReturnType<typeof createBuddyOpenCodeClient>
