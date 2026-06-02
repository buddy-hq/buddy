import { parseDiffFromFile, parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs"
import { formatPatch, structuredPatch } from "diff"

export type PierreFileStatus = "added" | "deleted" | "modified"

export type PierreViewDiff = {
  file: string
  patch: string
  additions: number
  deletions: number
  status?: PierreFileStatus
  fileDiff: FileDiffMetadata
}

export type PierreDiffInput = {
  file: string
  patch?: string
  before?: string
  after?: string
  additions: number
  deletions: number
  status?: PierreFileStatus
}

function patch(diff: PierreDiffInput) {
  if (typeof diff.patch === "string") {
    return { before: "", after: "", patch: diff.patch, preferRawPatch: true }
  }

  const before = diff.before ?? ""
  const after = diff.after ?? ""
  return {
    before,
    after,
    patch: formatPatch(
      structuredPatch(diff.file, diff.file, before, after, "", "", {
        context: Number.MAX_SAFE_INTEGER,
      }),
    ),
    preferRawPatch: false,
  }
}

function fileDiff(
  file: string,
  rawPatch: string,
  before: string,
  after: string,
  preferRawPatch: boolean,
): FileDiffMetadata {
  const parsed = preferRawPatch ? parsePatchFiles(rawPatch)[0]?.files[0] : undefined
  return parsed ?? parseDiffFromFile({ name: file, contents: before }, { name: file, contents: after })
}

export function normalizePierreDiff(diff: PierreDiffInput): PierreViewDiff {
  const normalized = patch(diff)
  return {
    file: diff.file,
    patch: normalized.patch,
    additions: diff.additions,
    deletions: diff.deletions,
    status: diff.status,
    fileDiff: fileDiff(diff.file, normalized.patch, normalized.before, normalized.after, normalized.preferRawPatch),
  }
}
