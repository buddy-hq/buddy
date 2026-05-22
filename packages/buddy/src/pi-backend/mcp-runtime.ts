import fsp from "node:fs/promises"
import path from "node:path"
import { piAgentDirectory } from "./paths"
import {
  getGlobalConfig,
  loadProjectConfig,
  loadProjectConfigFile,
} from "../config/store/read-config"

export type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

type OAuthGrantType = "authorization_code" | "client_credentials"

type OAuthConfig = {
  grantType?: OAuthGrantType
  clientId?: string
  clientSecret?: string
  scope?: string
}

type ServerDefinition = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  auth?: "oauth" | "bearer" | false
  bearerToken?: string
  bearerTokenEnv?: string
  oauth?: OAuthConfig | false
  lifecycle?: "keep-alive" | "lazy" | "eager"
  idleTimeout?: number
  exposeResources?: boolean
  directTools?: boolean | string[]
  excludeTools?: string[]
  debug?: boolean
}

type McpConnection = {
  status: "connected" | "closed" | "needs-auth"
}

type McpServerManagerLike = {
  connect: (name: string, definition: ServerDefinition) => Promise<McpConnection>
  close: (name: string) => Promise<void>
  closeAll: () => Promise<void>
}

type McpServerManagerConstructor = new () => McpServerManagerLike

type McpAuthModule = {
  authenticate: (
    serverName: string,
    serverUrl: string,
    definition?: ServerDefinition,
  ) => Promise<"authenticated" | "expired" | "not_authenticated">
  completeAuth: (
    serverName: string,
    authorizationCode: string,
  ) => Promise<"authenticated" | "expired" | "not_authenticated">
  initializeOAuth: () => Promise<void>
  removeAuth: (serverName: string) => Promise<void>
  startAuth: (
    serverName: string,
    serverUrl: string,
    definition?: ServerDefinition,
  ) => Promise<{ authorizationUrl: string }>
  supportsOAuth: (definition: ServerDefinition) => boolean
}

type BuddyMcpUiEntry = {
  enabled: boolean
  definition?: ServerDefinition
}

type BuddyMcpUiConfig = Record<string, BuddyMcpUiEntry>

type ManagedMcpState = {
  fingerprint: string
  manager: McpServerManagerLike
  config: BuddyMcpUiConfig
  errors: Map<string, string>
}

type UnknownMcpEntry = {
  type?: unknown
  enabled?: unknown
  command?: unknown
  environment?: unknown
  url?: unknown
  headers?: unknown
  oauth?: unknown
}

const PI_MCP_CONFIG_FILENAME = "mcp.json"
const BUDDY_PROJECT_DIRECTORY_NAME = ".buddy"
const MCP_ADAPTER_PACKAGE_NAME = "pi-mcp-adapter"
const MCP_SERVER_NOT_FOUND_PREFIX = "MCP server not found: "
const MCP_SERVER_OAUTH_UNSUPPORTED_PREFIX = "MCP server does not support OAuth: "

const mcpStateByDirectory = new Map<string, ManagedMcpState>()
let oauthInitialization: Promise<void> | undefined
let authModulePromise: Promise<McpAuthModule> | undefined
let managerConstructorPromise: Promise<McpServerManagerConstructor> | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false
  return Object.values(value).every((entry) => typeof entry === "string")
}

function isFunction<Fn extends (...args: never[]) => unknown>(value: unknown): value is Fn {
  return typeof value === "function"
}

function isConstructor(value: unknown): value is McpServerManagerConstructor {
  return typeof value === "function"
}

function parseCommand(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.every((item) => typeof item === "string") ? value : undefined
}

function readOAuthConfig(value: unknown): OAuthConfig | false | undefined {
  if (value === false) return false
  if (!isRecord(value)) return undefined
  const grantType =
    value.grantType === "authorization_code" || value.grantType === "client_credentials"
      ? value.grantType
      : undefined
  return {
    ...(grantType ? { grantType } : {}),
    ...(typeof value.clientId === "string" ? { clientId: value.clientId } : {}),
    ...(typeof value.clientSecret === "string" ? { clientSecret: value.clientSecret } : {}),
    ...(typeof value.scope === "string" ? { scope: value.scope } : {}),
  }
}

function translateBuddyMcpEntry(value: unknown): BuddyMcpUiEntry | undefined {
  if (!isRecord(value)) return undefined

  const candidate: UnknownMcpEntry = value
  const enabled = candidate.enabled !== false

  if (candidate.type === "local") {
    const command = parseCommand(candidate.command)
    if (!command || command.length === 0) return undefined
    return {
      enabled,
      definition: {
        command: command[0],
        args: command.slice(1),
        ...(isStringRecord(candidate.environment) ? { env: candidate.environment } : {}),
        lifecycle: "lazy",
      },
    }
  }

  if (candidate.type === "remote" && typeof candidate.url === "string") {
    const oauth = readOAuthConfig(candidate.oauth)
    return {
      enabled,
      definition: {
        url: candidate.url,
        ...(isStringRecord(candidate.headers) ? { headers: candidate.headers } : {}),
        ...(oauth === false ? { auth: false, oauth: false } : {}),
        ...(oauth ? { auth: "oauth" as const, oauth } : {}),
        lifecycle: "lazy",
      },
    }
  }

  if (candidate.enabled === false && Object.keys(candidate).length === 1) {
    return { enabled: false }
  }

  return undefined
}

function translateBuddyMcpConfig(config: { mcp?: unknown }): BuddyMcpUiConfig {
  if (!isRecord(config.mcp)) return {}

  const entries = Object.entries(config.mcp)
    .map(([name, value]) => {
      const translated = translateBuddyMcpEntry(value)
      return translated ? ([name, translated] as const) : undefined
    })
    .filter((entry): entry is readonly [string, BuddyMcpUiEntry] => !!entry)

  return Object.fromEntries(entries)
}

function activeDefinitions(config: BuddyMcpUiConfig): Record<string, ServerDefinition> {
  return Object.fromEntries(
    Object.entries(config)
      .filter(
        (entry): entry is [string, BuddyMcpUiEntry & { definition: ServerDefinition }] =>
          entry[1].enabled && !!entry[1].definition,
      )
      .map(([name, entry]) => [name, entry.definition]),
  )
}

function mcpFingerprint(config: BuddyMcpUiConfig) {
  return JSON.stringify(
    Object.entries(config)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([name, entry]) => [name, entry.enabled, entry.definition ?? null]),
  )
}

function statusFromError(message: string): McpStatus {
  if (/client registration/i.test(message)) {
    return { status: "needs_client_registration", error: message }
  }
  return { status: "failed", error: message }
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : String(error)
}

async function loadAuthModule(): Promise<McpAuthModule> {
  authModulePromise ??= (async () => {
    const modulePath = [MCP_ADAPTER_PACKAGE_NAME, "mcp-auth-flow.ts"].join("/")
    const candidate: unknown = await import(modulePath)
    if (!isRecord(candidate)) {
      throw new Error("Failed to load pi-mcp-adapter auth module")
    }

    if (
      !isFunction<McpAuthModule["authenticate"]>(candidate.authenticate) ||
      !isFunction<McpAuthModule["completeAuth"]>(candidate.completeAuth) ||
      !isFunction<McpAuthModule["initializeOAuth"]>(candidate.initializeOAuth) ||
      !isFunction<McpAuthModule["removeAuth"]>(candidate.removeAuth) ||
      !isFunction<McpAuthModule["startAuth"]>(candidate.startAuth) ||
      !isFunction<McpAuthModule["supportsOAuth"]>(candidate.supportsOAuth)
    ) {
      throw new Error("pi-mcp-adapter auth module is missing required exports")
    }

    return {
      authenticate: candidate.authenticate,
      completeAuth: candidate.completeAuth,
      initializeOAuth: candidate.initializeOAuth,
      removeAuth: candidate.removeAuth,
      startAuth: candidate.startAuth,
      supportsOAuth: candidate.supportsOAuth,
    }
  })()

  return authModulePromise
}

async function loadManagerConstructor(): Promise<McpServerManagerConstructor> {
  managerConstructorPromise ??= (async () => {
    const modulePath = [MCP_ADAPTER_PACKAGE_NAME, "server-manager.ts"].join("/")
    const candidate: unknown = await import(modulePath)
    if (!isRecord(candidate) || !isConstructor(candidate.McpServerManager)) {
      throw new Error("Failed to load pi-mcp-adapter server manager")
    }
    return candidate.McpServerManager
  })()

  return managerConstructorPromise
}

async function ensureOAuthReady() {
  oauthInitialization ??= loadAuthModule().then((module) => module.initializeOAuth())
  await oauthInitialization
}

async function createMcpServerManager(): Promise<McpServerManagerLike> {
  const ManagerConstructor = await loadManagerConstructor()
  return new ManagerConstructor()
}

async function ensureProjectMcpState(directory: string) {
  await ensureOAuthReady()
  const config = translateBuddyMcpConfig(await loadProjectConfig(directory))
  const fingerprint = mcpFingerprint(config)
  const existing = mcpStateByDirectory.get(directory)
  if (existing && existing.fingerprint === fingerprint) {
    return existing
  }

  if (existing) {
    await existing.manager.closeAll()
  }

  const nextState: ManagedMcpState = {
    fingerprint,
    manager: await createMcpServerManager(),
    config,
    errors: new Map<string, string>(),
  }
  mcpStateByDirectory.set(directory, nextState)
  return nextState
}

async function connectConfiguredServer(
  state: ManagedMcpState,
  name: string,
  definition: ServerDefinition,
): Promise<McpStatus> {
  try {
    const connection = await state.manager.connect(name, definition)
    state.errors.delete(name)
    return connection.status === "connected" ? { status: "connected" } : { status: "needs_auth" }
  } catch (error) {
    const message = errorMessage(error)
    state.errors.set(name, message)
    return statusFromError(message)
  }
}

async function readServerEntry(directory: string, name: string) {
  const state = await ensureProjectMcpState(directory)
  const entry = state.config[name]
  if (!entry) {
    throw new Error(`${MCP_SERVER_NOT_FOUND_PREFIX}${name}`)
  }
  return {
    state,
    entry,
  }
}

function projectPiMcpConfigPath(directory: string) {
  return path.join(directory, BUDDY_PROJECT_DIRECTORY_NAME, PI_MCP_CONFIG_FILENAME)
}

function globalPiMcpConfigPath() {
  return path.join(piAgentDirectory(), PI_MCP_CONFIG_FILENAME)
}

async function writePiMcpConfigFile(filepath: string, servers: Record<string, ServerDefinition>) {
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
  await fsp.writeFile(filepath, `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`, "utf8")
}

export async function syncProjectPiMcpConfig(directory: string) {
  const config = translateBuddyMcpConfig(await loadProjectConfigFile(directory))
  await writePiMcpConfigFile(projectPiMcpConfigPath(directory), activeDefinitions(config))
}

export async function syncGlobalPiMcpConfig() {
  const config = translateBuddyMcpConfig(await getGlobalConfig())
  await writePiMcpConfigFile(globalPiMcpConfigPath(), activeDefinitions(config))
}

export async function listMcpStatus(directory: string) {
  const state = await ensureProjectMcpState(directory)
  const status: Record<string, McpStatus> = {}

  for (const [name, entry] of Object.entries(state.config)) {
    if (!entry.enabled || !entry.definition) {
      await state.manager.close(name)
      status[name] = { status: "disabled" }
      continue
    }

    status[name] = await connectConfiguredServer(state, name, entry.definition)
  }

  return status
}

export async function refreshMcpStatus(directory: string) {
  return listMcpStatus(directory)
}

export async function connectMcpServer(directory: string, name: string) {
  const { state, entry } = await readServerEntry(directory, name)
  if (!entry.enabled || !entry.definition) {
    await state.manager.close(name)
    return false
  }

  await state.manager.close(name)
  const result = await connectConfiguredServer(state, name, entry.definition)
  return result.status === "connected" || result.status === "needs_auth"
}

export async function disconnectMcpServer(directory: string, name: string) {
  const { state } = await readServerEntry(directory, name)
  await state.manager.close(name)
  state.errors.delete(name)
  return true
}

export async function authenticateMcpServer(directory: string, name: string): Promise<McpStatus> {
  const { state, entry } = await readServerEntry(directory, name)
  if (!entry.definition?.url) {
    throw new Error(`${MCP_SERVER_NOT_FOUND_PREFIX}${name}`)
  }

  const authModule = await loadAuthModule()
  if (!authModule.supportsOAuth(entry.definition)) {
    throw new Error(`${MCP_SERVER_OAUTH_UNSUPPORTED_PREFIX}${name}`)
  }

  await authModule.authenticate(name, entry.definition.url, entry.definition)
  await state.manager.close(name)
  return connectConfiguredServer(state, name, entry.definition)
}

export async function startMcpServerAuth(directory: string, name: string) {
  const { entry } = await readServerEntry(directory, name)
  if (!entry.definition?.url) {
    throw new Error(`${MCP_SERVER_NOT_FOUND_PREFIX}${name}`)
  }

  const authModule = await loadAuthModule()
  if (!authModule.supportsOAuth(entry.definition)) {
    throw new Error(`${MCP_SERVER_OAUTH_UNSUPPORTED_PREFIX}${name}`)
  }

  return authModule.startAuth(name, entry.definition.url, entry.definition)
}

export async function completeMcpServerAuth(
  directory: string,
  name: string,
  authorizationCode: string,
): Promise<McpStatus> {
  const { state, entry } = await readServerEntry(directory, name)
  const authModule = await loadAuthModule()
  await authModule.completeAuth(name, authorizationCode)
  if (!entry.definition) {
    return { status: "disabled" }
  }
  await state.manager.close(name)
  return connectConfiguredServer(state, name, entry.definition)
}

export async function removeMcpServerAuth(directory: string, name: string) {
  const { state } = await readServerEntry(directory, name)
  const authModule = await loadAuthModule()
  await state.manager.close(name)
  await authModule.removeAuth(name)
  state.errors.delete(name)
  return { success: true as const }
}
