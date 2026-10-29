import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { OpenCode } from "@opencode/sdk"
import { Flock } from "@opencode/util/flock"
import z from "zod"
import { v2DatabaseLock } from "./seed-v2-database"
import { readV1ImportEntryAt, writeV1ImportEntryAt } from "./v1-import-guard"

const MCP_AUTH_FILE_NAME = "mcp-auth.json"
const MCP_AUTH_IMPORT_LOCK_NAME = "buddy-v1-mcp-auth-import"
const MCP_AUTH_IMPORT_KEY = "mcp-auth"
const MCP_CREDENTIAL_LABEL = "OAuth"
const MCP_TOKEN_TYPE = "Bearer"
const MCP_INTEGRATION_PREFIX = "mcp_"
const MCP_INTEGRATION_HASH_LENGTH = 16
const MCP_INTEGRATION_SEPARATOR = "\u0000"
const MILLISECONDS_PER_SECOND = 1000

const v1TokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scope: z.string().optional(),
})

const v1ClientInfoSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  clientIdIssuedAt: z.number().optional(),
  clientSecretExpiresAt: z.number().optional(),
})

const v1EntrySchema = z.object({
  tokens: v1TokensSchema.optional(),
  clientInfo: v1ClientInfoSchema.optional(),
  serverUrl: z.string().optional(),
})

const v1FileSchema = z.record(z.string(), z.unknown())
const importRecordSchema = z.object({ at: z.number(), imported: z.number(), skipped: z.number() })
const errnoSchema = z.object({ code: z.string() })

type V1Tokens = z.infer<typeof v1TokensSchema>
type V1ClientInfo = z.infer<typeof v1ClientInfoSchema>
type ImportCounts = { readonly imported: number; readonly skipped: number }
type UsableEntry = {
  readonly serverUrl: string
  readonly tokens: V1Tokens
  readonly clientInfo: V1ClientInfo | undefined
}
type SignInEntry = { readonly name: string; readonly usable: UsableEntry | undefined }
type SignInFile =
  | { readonly kind: "missing" }
  | { readonly kind: "unusable" }
  | { readonly kind: "entries"; readonly entries: readonly SignInEntry[] }

type StoredOAuthClient = {
  readonly client_id: string
  readonly client_secret?: string
  readonly client_id_issued_at?: number
  readonly client_secret_expires_at?: number
}

type McpOAuthMetadata = {
  readonly serverUrl: string
  readonly tokenType: string
  readonly scope?: string
  readonly client?: StoredOAuthClient
}

export type McpAuthImportHost = Pick<OpenCode.Interface, "credential">

export type McpAuthImportPaths = {
  readonly data: string
  readonly database: string
}

function errnoCode<TError>(error: TError): string | undefined {
  const parsed = errnoSchema.safeParse(error)
  return parsed.success ? parsed.data.code : undefined
}

function errorText<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}

function mcpIntegrationID(name: string, serverUrl: string): string {
  const digest = createHash("sha1")
    .update(name + MCP_INTEGRATION_SEPARATOR + serverUrl)
    .digest("hex")
  return MCP_INTEGRATION_PREFIX + digest.slice(0, MCP_INTEGRATION_HASH_LENGTH)
}

function storedOAuthClient(clientInfo: V1ClientInfo): StoredOAuthClient {
  return {
    client_id: clientInfo.clientId,
    client_secret: clientInfo.clientSecret,
    client_id_issued_at: clientInfo.clientIdIssuedAt,
    client_secret_expires_at: clientInfo.clientSecretExpiresAt,
  }
}

function oauthCredentialValue(integrationID: string, entry: UsableEntry) {
  const { tokens, clientInfo } = entry
  const metadata: McpOAuthMetadata = {
    serverUrl: entry.serverUrl,
    tokenType: MCP_TOKEN_TYPE,
    scope: tokens.scope,
    client: clientInfo && storedOAuthClient(clientInfo),
  }
  return {
    type: "oauth" as const,
    methodID: integrationID,
    access: tokens.accessToken,
    refresh: tokens.refreshToken ?? "",
    expires:
      tokens.expiresAt === undefined ? 0 : Math.floor(tokens.expiresAt * MILLISECONDS_PER_SECOND),
    metadata,
  }
}

function usableEntry<TEntry>(raw: TEntry): UsableEntry | undefined {
  const parsed = v1EntrySchema.safeParse(raw)
  if (!parsed.success) return undefined
  const { tokens, clientInfo, serverUrl } = parsed.data
  if (!tokens?.accessToken || !serverUrl) return undefined
  return { serverUrl, tokens, clientInfo }
}

function parseSignInFile(text: string): readonly SignInEntry[] | undefined {
  let parsed
  try {
    parsed = v1FileSchema.safeParse(JSON.parse(text))
  } catch {
    return undefined
  }
  if (!parsed.success) return undefined
  return Object.entries(parsed.data).map(([name, raw]) => ({ name, usable: usableEntry(raw) }))
}

async function readSignInFile(file: string): Promise<SignInFile> {
  let text: string
  try {
    text = await fs.readFile(file, "utf8")
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return { kind: "missing" }
    console.warn(
      "Could not read the previous version's MCP sign-ins; trying again at the next start:",
      errorText(error),
    )
    return { kind: "unusable" }
  }
  const entries = parseSignInFile(text)
  if (entries) return { kind: "entries", entries }
  console.warn(
    "The previous version's MCP sign-in file is not a JSON object; trying again at the next start:",
    file,
  )
  return { kind: "unusable" }
}

function importRecorded(databasePath: string): boolean {
  return readV1ImportEntryAt(databasePath, MCP_AUTH_IMPORT_KEY, importRecordSchema) !== undefined
}

async function importEntries(
  host: McpAuthImportHost,
  entries: readonly SignInEntry[],
): Promise<ImportCounts> {
  const signedIn = new Set(
    (await host.credential.list()).map((credential) => credential.integrationID),
  )
  let imported = 0
  let skipped = 0
  for (const { name, usable: entry } of entries) {
    if (!entry) {
      skipped += 1
      continue
    }
    const integrationID = mcpIntegrationID(name, entry.serverUrl)
    if (signedIn.has(integrationID)) {
      skipped += 1
      continue
    }
    try {
      await host.credential.create({
        integrationID,
        label: MCP_CREDENTIAL_LABEL,
        value: oauthCredentialValue(integrationID, entry),
      })
      signedIn.add(integrationID)
      imported += 1
    } catch {
      console.warn("Could not carry over the previous version's sign-in for MCP server", name)
      skipped += 1
    }
  }
  return { imported, skipped }
}

async function importUnderLock(host: McpAuthImportHost, paths: McpAuthImportPaths) {
  if (importRecorded(paths.database)) return
  const file = await readSignInFile(path.join(paths.data, MCP_AUTH_FILE_NAME))
  if (file.kind === "unusable") return
  const counts =
    file.kind === "missing" ? { imported: 0, skipped: 0 } : await importEntries(host, file.entries)
  writeV1ImportEntryAt(paths.database, MCP_AUTH_IMPORT_KEY, { at: Date.now(), ...counts })
  if (file.kind === "entries")
    console.warn("Carried over MCP sign-ins from the previous version:", counts)
}

export async function importV1McpSignIns(
  host: McpAuthImportHost,
  paths: McpAuthImportPaths,
): Promise<void> {
  try {
    if (importRecorded(paths.database)) return
    const lock = await v2DatabaseLock(paths.database, MCP_AUTH_IMPORT_LOCK_NAME)
    await Flock.withLock(lock.key, () => importUnderLock(host, paths), { dir: lock.dir })
  } catch (error) {
    console.warn(
      "Could not carry over MCP sign-ins from the previous version; trying again at the next start:",
      errorText(error),
    )
  }
}
