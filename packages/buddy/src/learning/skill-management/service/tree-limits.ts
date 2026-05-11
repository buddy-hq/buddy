import fsp from "node:fs/promises"
import path from "node:path"

export const DEFAULT_SKILL_TREE_MAX_FILES = 500
export const DEFAULT_SKILL_TREE_MAX_TOTAL_BYTES = 5 * 1024 * 1024
export const DEFAULT_SKILL_TREE_MAX_FILE_BYTES = 1024 * 1024
export const SKILL_TREE_EXCLUDED_DIRECTORY_NAMES = new Set([".git", ".hg", ".svn"])
export const SKILL_TREE_EXCLUDED_RELATIVE_PATHS = new Set([".buddy/install.json"])
export const SKILL_TREE_EXCLUDED_FILE_NAMES = new Set([
  ".buddy-skill-lock.json",
  ".buddy-install.json",
])

export type SkillTreeLimits = {
  maxFiles: number
  maxTotalBytes: number
  maxFileBytes: number
}

export type SkillTreeStats = {
  fileCount: number
  totalBytes: number
}

export type SkillTreeLimitViolationCode = "too_many_files" | "oversized_tree" | "oversized_file"

export class SkillTreeLimitError extends Error {
  constructor(
    readonly code: SkillTreeLimitViolationCode,
    message: string,
  ) {
    super(message)
    this.name = "SkillTreeLimitError"
  }
}

export const DEFAULT_SKILL_TREE_LIMITS: SkillTreeLimits = {
  maxFiles: DEFAULT_SKILL_TREE_MAX_FILES,
  maxTotalBytes: DEFAULT_SKILL_TREE_MAX_TOTAL_BYTES,
  maxFileBytes: DEFAULT_SKILL_TREE_MAX_FILE_BYTES,
}

export function normalizeSkillTreeLimits(limits?: Partial<SkillTreeLimits>): SkillTreeLimits {
  return {
    maxFiles: Math.max(1, limits?.maxFiles ?? DEFAULT_SKILL_TREE_LIMITS.maxFiles),
    maxTotalBytes: Math.max(1, limits?.maxTotalBytes ?? DEFAULT_SKILL_TREE_LIMITS.maxTotalBytes),
    maxFileBytes: Math.max(1, limits?.maxFileBytes ?? DEFAULT_SKILL_TREE_LIMITS.maxFileBytes),
  }
}

export function toPosixRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/")
}

export function shouldIncludeSkillTreePath(root: string, filePath: string): boolean {
  const relativePath = toPosixRelativePath(root, filePath)
  const segments = relativePath.split("/")
  if (segments.some((segment) => SKILL_TREE_EXCLUDED_DIRECTORY_NAMES.has(segment))) {
    return false
  }
  if (SKILL_TREE_EXCLUDED_RELATIVE_PATHS.has(relativePath)) {
    return false
  }
  return !SKILL_TREE_EXCLUDED_FILE_NAMES.has(path.basename(filePath))
}

export async function collectRegularSkillFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const stack = [path.resolve(root)]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    const entries = await fsp.readdir(current, { withFileTypes: true })
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (!shouldIncludeSkillTreePath(root, fullPath)) {
        continue
      }
      const stat = await fsp.lstat(fullPath)
      if (stat.isSymbolicLink()) {
        throw new Error(`Skill tree contains symlink: ${toPosixRelativePath(root, fullPath)}`)
      }
      if (stat.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (stat.isFile()) {
        files.push(fullPath)
      }
    }
  }

  return files.toSorted((left, right) => {
    const leftPath = toPosixRelativePath(root, left)
    const rightPath = toPosixRelativePath(root, right)
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0
  })
}

export async function assertSkillTreeLimits(
  root: string,
  limits?: Partial<SkillTreeLimits>,
): Promise<SkillTreeStats> {
  const normalizedLimits = normalizeSkillTreeLimits(limits)
  const files = await collectRegularSkillFiles(root)
  if (files.length > normalizedLimits.maxFiles) {
    throw new SkillTreeLimitError(
      "too_many_files",
      `Skill tree has ${files.length} files; limit is ${normalizedLimits.maxFiles}`,
    )
  }

  let totalBytes = 0
  for (const file of files) {
    const stat = await fsp.stat(file)
    if (stat.size > normalizedLimits.maxFileBytes) {
      throw new SkillTreeLimitError(
        "oversized_file",
        `Skill file ${toPosixRelativePath(root, file)} is ${stat.size} bytes; limit is ${normalizedLimits.maxFileBytes}`,
      )
    }
    totalBytes += stat.size
    if (totalBytes > normalizedLimits.maxTotalBytes) {
      throw new SkillTreeLimitError(
        "oversized_tree",
        `Skill tree is ${totalBytes} bytes; limit is ${normalizedLimits.maxTotalBytes}`,
      )
    }
  }

  return {
    fileCount: files.length,
    totalBytes,
  }
}
