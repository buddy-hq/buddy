import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "../../project/directory.js"

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

export type EnsureAllowedDirectory = (request: Request) => AllowedDirectoryResult

export type DirectoryRequestContext = {
  request: Request
  requestURL: URL
  directory: string
}

function requestDirectory(request: Request): { requestURL: URL; directory: string } {
  const requestURL = new URL(request.url)
  const rawDirectory =
    requestURL.searchParams.get("directory") ??
    request.headers.get("x-buddy-directory") ??
    request.headers.get("x-opencode-directory") ??
    ""

  return {
    requestURL,
    directory: resolveDirectory(rawDirectory),
  }
}

export const ensureAllowedDirectory: EnsureAllowedDirectory = (request) => {
  const { requestURL, directory } = requestDirectory(request)
  if (!isAllowedDirectory(directory, allowedDirectoryRoots())) {
    return {
      ok: false,
      response: Response.json({ error: "Directory is outside allowed roots" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    directory,
    requestURL,
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
      requestURL: allowed.requestURL,
      directory: allowed.directory,
    },
  }
}
