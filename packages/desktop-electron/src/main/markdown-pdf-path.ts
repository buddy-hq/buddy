import { access, constants, realpath } from "node:fs/promises"
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path"

const MAX_MARKDOWN_PDF_EXPORT_PATH_ATTEMPTS = 1000

function comparablePath(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value
}

export function isPathInsideDirectory(pathname: string, directory: string): boolean {
  const relativePath = relative(comparablePath(directory), comparablePath(pathname))
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

async function resolveCanonicalPath(pathname: string): Promise<string> {
  try {
    return await realpath(pathname)
  } catch {
    return resolve(pathname)
  }
}

async function resolveExportDirectory(input: {
  allowedRoots: readonly string[]
  directory: string
}): Promise<string> {
  if (!isAbsolute(input.directory)) {
    throw new Error("PDF export directory must be absolute.")
  }

  const directory = await realpath(input.directory)
  const allowedRoots = await Promise.all(input.allowedRoots.map(resolveCanonicalPath))
  const allowed = allowedRoots.some((root) => isPathInsideDirectory(directory, root))
  if (!allowed) {
    throw new Error("PDF export directory is outside the allowed notebook roots.")
  }

  return directory
}

function resolveExportFileName(defaultPath: string): string {
  const base = basename(defaultPath)
  if (!base || base === "." || base === "..") {
    throw new Error("PDF export file name is invalid.")
  }
  return base
}

export async function resolveAvailableMarkdownPdfExportPath(input: {
  allowedRoots: readonly string[]
  defaultPath: string
  directory: string
}): Promise<string> {
  const directory = await resolveExportDirectory(input)
  const base = resolveExportFileName(input.defaultPath)
  const ext = extname(base)
  const stem = base.slice(0, base.length - ext.length)
  const candidate = join(directory, base)

  if (!isPathInsideDirectory(candidate, directory)) {
    throw new Error("PDF export path is outside the notebook directory.")
  }

  let index = 0
  let next = candidate
  while (index < MAX_MARKDOWN_PDF_EXPORT_PATH_ATTEMPTS) {
    try {
      await access(next, constants.F_OK)
    } catch {
      return next
    }
    index += 1
    next = join(directory, `${stem} (${index})${ext}`)
  }

  throw new Error("Could not find an available PDF export path.")
}
