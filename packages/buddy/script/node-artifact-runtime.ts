import { existsSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import path from "node:path"
import * as XLSX from "xlsx"
import { assertBackendNodeArtifactRuntimeFiles } from "../../../script/backend-node-artifact"
import {
  parseTJsonObject,
  parseTJsonText,
  parseTPortedAddress,
  parseTString,
} from "./parse-values"

export const HOSTNAME = "127.0.0.1"
export const USERNAME = "buddy"
export const PASSWORD = "node-artifact-smoke"
export const HEALTHZ_PATH = "/api/healthz"
export const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
export const DEFAULT_POLL_INTERVAL_MS = 250
export const LOG_TAIL_CHARACTERS = 8_000

const DIRECTORY_HEADER = "x-buddy-directory" as const
const JSON_CONTENT_TYPE = "application/json" as const
const RESOURCE_ROUTE_PATH = "/api/objects/resource" as const
const RESOURCE_ROUTE_SMOKE_ALIAS = "artifact-route-smoke" as const
const RESOURCE_ROUTE_SMOKE_FILENAME = "artifact-route-smoke.md" as const
const RESOURCE_ROUTE_SMOKE_TEXT = "# Artifact Route Smoke\n\nPackaged route resource prep smoke.\n"
const SPREADSHEET_ROUTE_SMOKE_ALIAS = "artifact-spreadsheet-route-smoke" as const
const SPREADSHEET_ROUTE_SMOKE_FILENAME = "artifact-spreadsheet-route-smoke.xlsx" as const
const RESOURCE_READY_STATUS = "ready" as const
const RESOURCE_ROUTE_POLL_TIMEOUT_MS = 3_000

type TResourceRouteEntry = {
  alias: string
  fullTextPath?: string
  packPath?: string
  status: string
}

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const DEFAULT_ENTRYPOINT = path.resolve(BACKEND_DIR, "dist/node/node.js")

export type NodeArtifactProcess = ReturnType<typeof Bun.spawn>

export type ProbeResult = {
  body: string
  error?: string
  ok: boolean
  status?: number
}

export function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  return args[index + 1]
}

export function resolveNodeArtifactEntrypoint(configuredPath: string | undefined) {
  const entrypoint = path.resolve(configuredPath ?? DEFAULT_ENTRYPOINT)
  if (!existsSync(entrypoint)) {
    throw new Error(`Buddy Node backend artifact not found at ${entrypoint}`)
  }
  return entrypoint
}

export async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, HOSTNAME, () => {
      const address = parseTPortedAddress(server.address())
      if (address === undefined) {
        server.close()
        reject(new Error("Failed to allocate a Buddy Node backend port"))
        return
      }

      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return ""
  return await new Response(stream).text()
}

export async function assertNodeArtifactRuntimeAssets(entrypoint: string): Promise<void> {
  const artifactDir = path.dirname(entrypoint)
  assertBackendNodeArtifactRuntimeFiles({ artifactDir })
  assertNoArtifactLocalNodeModules(artifactDir)
}

export function tail(text: string): string {
  if (text.length <= LOG_TAIL_CHARACTERS) return text
  return text.slice(text.length - LOG_TAIL_CHARACTERS)
}

export async function probe(input: {
  baseUrl: string
  pathname: string
  timeoutMs: number
}): Promise<ProbeResult> {
  try {
    const response = await fetch(new URL(input.pathname, input.baseUrl), {
      headers: {
        authorization: basicAuthorizationHeader(),
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    })
    const body = await response.text()
    return {
      body,
      ok: response.ok,
      status: response.status,
    }
  } catch (error) {
    return {
      body: "",
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    }
  }
}

export async function assertNodeArtifactResourceRouteSmoke(input: {
  baseUrl: string
  directory: string
  timeoutMs: number
}): Promise<void> {
  const sourcePath = path.join(input.directory, RESOURCE_ROUTE_SMOKE_FILENAME)
  writeFileSync(sourcePath, RESOURCE_ROUTE_SMOKE_TEXT, "utf8")

  await createAndWaitForReadyResource({
    ...input,
    alias: RESOURCE_ROUTE_SMOKE_ALIAS,
    sourcePath,
  })
}

export async function assertNodeArtifactSpreadsheetRouteSmoke(input: {
  baseUrl: string
  directory: string
  timeoutMs: number
}): Promise<void> {
  const sourcePath = path.join(input.directory, SPREADSHEET_ROUTE_SMOKE_FILENAME)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Student", "Score"],
      ["Ada", 95],
    ]),
    "Scores",
  )
  const workbookBytes: unknown = XLSX.write(workbook, {
    bookType: "xlsx",
    compression: true,
    type: "buffer",
  })
  if (!(workbookBytes instanceof Uint8Array)) {
    throw new Error("SheetJS smoke fixture writer did not return workbook bytes")
  }
  writeFileSync(sourcePath, workbookBytes)

  await createAndWaitForReadyResource({
    ...input,
    alias: SPREADSHEET_ROUTE_SMOKE_ALIAS,
    sourcePath,
  })
}

async function createAndWaitForReadyResource(input: {
  alias: string
  baseUrl: string
  directory: string
  sourcePath: string
  timeoutMs: number
}): Promise<void> {
  const createResponse = await fetch(new URL(RESOURCE_ROUTE_PATH, input.baseUrl), {
    method: "POST",
    headers: {
      authorization: basicAuthorizationHeader(),
      [DIRECTORY_HEADER]: input.directory,
      "content-type": JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      alias: input.alias,
      sourcePath: input.sourcePath,
    }),
  })
  if (!createResponse.ok) {
    throw new Error(
      `Resource route smoke create failed (${createResponse.status}): ${await createResponse.text()}`,
    )
  }

  const deadline = Date.now() + input.timeoutMs
  let last = ""
  while (Date.now() < deadline) {
    try {
      const listResponse = await fetch(new URL(RESOURCE_ROUTE_PATH, input.baseUrl), {
        headers: {
          authorization: basicAuthorizationHeader(),
          [DIRECTORY_HEADER]: input.directory,
        },
        signal: AbortSignal.timeout(RESOURCE_ROUTE_POLL_TIMEOUT_MS),
      })
      last = await listResponse.text()
      if (listResponse.ok) {
        const body = parseTJsonText(last)
        if (body === undefined) {
          throw new Error("Resource route list was not valid JSON")
        }
        const resources = parseTResourceList(body)
        const resource = resources.find((entry) => entry.alias === input.alias)
        if (
          resource?.status === RESOURCE_READY_STATUS &&
          resource.packPath !== undefined &&
          resource.fullTextPath !== undefined
        ) {
          return
        }
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }

    await delay(DEFAULT_POLL_INTERVAL_MS)
  }

  throw new Error(`Resource route smoke did not become ready: ${last}`)
}

function assertNoArtifactLocalNodeModules(artifactDir: string): void {
  const nodeModulesPath = path.join(artifactDir, "node_modules")
  if (existsSync(nodeModulesPath)) {
    throw new Error(
      `Buddy Node artifact must not carry a runtime node_modules tree: ${nodeModulesPath}`,
    )
  }
}

function basicAuthorizationHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`
}

function parseTResourceList<TValue>(body: TValue): TResourceRouteEntry[] {
  const record = parseTJsonObject(body)
  if (record === undefined) return []
  if (!Array.isArray(record.resources)) return []
  const resources: TResourceRouteEntry[] = []
  for (const entry of record.resources) {
    const parsed = parseTResourceRouteEntry(entry)
    if (parsed !== undefined) resources.push(parsed)
  }
  return resources
}

function parseTResourceRouteEntry<TValue>(value: TValue): TResourceRouteEntry | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const alias = parseTString(record.alias)
  const status = parseTString(record.status)
  if (alias === undefined || status === undefined) return undefined
  const packPath = parseTString(record.packPath)
  const fullTextPath = parseTString(record.fullTextPath)
  return Object.assign(
    { alias, status },
    packPath !== undefined ? { packPath } : undefined,
    fullTextPath !== undefined ? { fullTextPath } : undefined,
  )
}
