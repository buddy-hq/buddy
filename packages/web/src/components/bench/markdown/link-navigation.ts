import { BENCH_WORKSPACE_ROOT_NOTEBOOK, type BenchWorkspaceRoot } from "@/lib/bench-targets"
import { anchorMarkdownOutsidePath, resolveMarkdownFileLink } from "@/lib/markdown-file-links"

export type TMarkdownBenchOutsideOpen = {
  readonly directory: string
  readonly path: string
}

export type MarkdownBenchLinkTarget =
  | { type: "external"; url: string }
  | { type: "workspace-file"; path: string; root: BenchWorkspaceRoot; fragment?: string }
  | { type: "outside-file"; path: string }

export function resolveMarkdownBenchLink(
  documentPath: string,
  href: string,
  root?: BenchWorkspaceRoot,
): MarkdownBenchLinkTarget | undefined {
  const resolved = resolveMarkdownFileLink(documentPath, href)
  if (!resolved) return undefined
  if (resolved.kind === "external") return { type: "external", url: resolved.url }
  if (resolved.kind === "outside") return { type: "outside-file", path: resolved.path }
  return Object.assign(
    {
      type: "workspace-file" as const,
      path: resolved.path,
      root: root ?? BENCH_WORKSPACE_ROOT_NOTEBOOK,
    },
    resolved.fragment ? { fragment: resolved.fragment } : undefined,
  )
}

export function markdownBenchOutsideFileOpen(input: {
  notebookDirectory: string
  storageDirectory: string
  outsidePath: string
}): TMarkdownBenchOutsideOpen {
  return {
    directory: input.notebookDirectory,
    path: anchorMarkdownOutsidePath(input.storageDirectory, input.outsidePath),
  }
}
