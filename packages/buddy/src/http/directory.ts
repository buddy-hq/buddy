import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from '../project'

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

function requestDirectory(source: DirectoryRequestSource): { requestURL: URL; directory: string } {
  const requestURL = readSourceURL(source)
  const rawDirectory =
    requestURL.searchParams.get('directory') ??
    readSourceHeader(source, 'x-buddy-directory') ??
    readSourceHeader(source, 'x-opencode-directory') ??
    ''

  return {
    requestURL,
    directory: resolveDirectory(rawDirectory),
  }
}

export const ensureAllowedDirectory: EnsureAllowedDirectory = (source) => {
  const { requestURL, directory } = requestDirectory(source)
  if (!isAllowedDirectory(directory, allowedDirectoryRoots())) {
    return {
      ok: false,
      response: Response.json({ error: 'Directory is outside allowed roots' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    directory,
    requestURL,
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
