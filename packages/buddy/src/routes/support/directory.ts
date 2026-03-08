import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "../../project/directory.js"

export type AllowedDirectoryResult =
  | {
      ok: true
      directory: string
    }
  | {
      ok: false
      response: Response
    }

export type EnsureAllowedDirectory = (request: Request) => AllowedDirectoryResult

export type DirectoryRequestContext = {
  request: Request
  requestURL: URL
  directory: string
}

const directoryRoots = allowedDirectoryRoots()

function requestDirectory(request: Request): string {
  const url = new URL(request.url)
  const rawDirectory =
    url.searchParams.get("directory") ??
    request.headers.get("x-buddy-directory") ??
    request.headers.get("x-opencode-directory") ??
    ""

  return resolveDirectory(rawDirectory)
}

export const ensureAllowedDirectory: EnsureAllowedDirectory = (request) => {
  const directory = requestDirectory(request)
  if (!isAllowedDirectory(directory, directoryRoots)) {
    return {
      ok: false,
      response: Response.json({ error: "Directory is outside allowed roots" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    directory,
  }
}

export function resolveDirectoryRequestContext(request: Request):
  | {
      ok: true
      context: DirectoryRequestContext
    }
  | {
      ok: false
      response: Response
    } {
  const allowed = ensureAllowedDirectory(request)
  if (!allowed.ok) return allowed

  return {
    ok: true,
    context: {
      request,
      requestURL: new URL(request.url),
      directory: allowed.directory,
    },
  }
}
