import fs from "node:fs"
import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "../project"
import { isDirectoryInOpenProjectRegistry } from "../project/open-project-registry"

export type DirectoryRequestSource =
  | Request
  | {
      req: {
        url: string
        header: (name: string) => string | undefined
      }
    }

export type AllowedDirectoryResult =
  | {
      ok: true
      directory: string
      requestURL: URL
    }
  | {
      ok: false
      response: Response
    }

export type EnsureAllowedDirectory = (source: DirectoryRequestSource) => AllowedDirectoryResult

export type DirectoryRequestContext = {
  requestURL: URL
  directory: string
}

export type OptionalDirectoryRequestContext = {
  requestURL: URL
  directory?: string
}

const DIRECTORY_FORBIDDEN_STATUS = 403
const DIRECTORY_NOT_FOUND_STATUS = 404
const DIRECTORY_ACCESS_DENIED_ERROR_CODES = new Set(["EACCES", "EPERM"])

type NodeErrorWithCode = {
  code?: unknown
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const candidate = error as NodeErrorWithCode
  return typeof candidate.code === "string" ? candidate.code : undefined
}

function inaccessibleDirectoryMessage(directory: string) {
  if (process.platform === "darwin") {
    return `Buddy cannot access ${directory}. Grant Buddy access to this folder in macOS Privacy & Security, or move the project outside protected folders like Documents.`
  }

  return `Buddy cannot access ${directory}. Check this folder's permissions and try again.`
}

function validateDirectoryAccess(directory: string): Response | undefined {
  try {
    const stats = fs.lstatSync(directory)
    if (!stats.isDirectory()) {
      return Response.json(
        { error: `Directory not found: ${directory}` },
        { status: DIRECTORY_NOT_FOUND_STATUS },
      )
    }
    fs.accessSync(directory, fs.constants.R_OK)
    return undefined
  } catch (error) {
    const code = readErrorCode(error)

    if (DIRECTORY_ACCESS_DENIED_ERROR_CODES.has(code ?? "")) {
      return Response.json(
        {
          error: inaccessibleDirectoryMessage(directory),
        },
        { status: DIRECTORY_FORBIDDEN_STATUS },
      )
    }

    if (code === "ENOENT") {
      return Response.json(
        { error: `Directory not found: ${directory}` },
        { status: DIRECTORY_NOT_FOUND_STATUS },
      )
    }

    return undefined
  }
}

function readSourceURL(source: DirectoryRequestSource): URL {
  if (source instanceof Request) {
    return new URL(source.url)
  }
  return new URL(source.req.url)
}

function readSourceHeader(source: DirectoryRequestSource, name: string): string | null {
  if (source instanceof Request) {
    return source.headers.get(name)
  }
  return source.req.header(name) ?? null
}

function readRawDirectory(source: DirectoryRequestSource) {
  const requestURL = readSourceURL(source)
  const rawDirectory =
    requestURL.searchParams.get("directory") ??
    readSourceHeader(source, "x-buddy-directory") ??
    readSourceHeader(source, "x-opencode-directory")

  return {
    requestURL,
    rawDirectory,
  }
}

function requestDirectory(source: DirectoryRequestSource): { requestURL: URL; directory: string } {
  const { requestURL, rawDirectory } = readRawDirectory(source)

  return {
    requestURL,
    directory: resolveDirectory(rawDirectory ?? ""),
  }
}

function validateAllowedDirectory(requestURL: URL, directory: string): AllowedDirectoryResult {
  const allowedByRoots = isAllowedDirectory(directory, allowedDirectoryRoots())
  const allowedByOpenProjectRegistry = isDirectoryInOpenProjectRegistry(directory)

  if (!allowedByRoots && !allowedByOpenProjectRegistry) {
    return {
      ok: false,
      response: Response.json({ error: "Directory is outside allowed roots" }, { status: 403 }),
    }
  }

  const accessFailure = validateDirectoryAccess(directory)
  if (accessFailure) {
    return {
      ok: false,
      response: accessFailure,
    }
  }

  return {
    ok: true,
    directory,
    requestURL,
  }
}

export const ensureAllowedDirectory: EnsureAllowedDirectory = (source) => {
  const { requestURL, directory } = requestDirectory(source)
  return validateAllowedDirectory(requestURL, directory)
}

export function resolveOptionalDirectoryRequestContext(source: DirectoryRequestSource):
  | {
      ok: true
      context: OptionalDirectoryRequestContext
    }
  | {
      ok: false
      response: Response
    } {
  const { requestURL, rawDirectory } = readRawDirectory(source)
  if (typeof rawDirectory !== "string" || rawDirectory.trim().length === 0) {
    return {
      ok: true,
      context: {
        requestURL,
      },
    }
  }

  const allowed = validateAllowedDirectory(requestURL, resolveDirectory(rawDirectory))
  if (!allowed.ok) return allowed

  return {
    ok: true,
    context: {
      requestURL,
      directory: allowed.directory,
    },
  }
}

export function resolveDirectoryRequestContext(source: DirectoryRequestSource):
  | {
      ok: true
      context: DirectoryRequestContext
    }
  | {
      ok: false
      response: Response
    } {
  const allowed = ensureAllowedDirectory(source)
  if (!allowed.ok) return allowed

  return {
    ok: true,
    context: {
      requestURL: allowed.requestURL,
      directory: allowed.directory,
    },
  }
}
