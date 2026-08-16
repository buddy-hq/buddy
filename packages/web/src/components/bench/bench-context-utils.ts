import { absoluteWorkspaceFilePath, fileNameFromPath } from "@/lib/workspace-file-paths"
import { benchTargetKey, type BenchTarget } from "@/lib/bench-navigation"
import type { BenchReadContextOpenOutput } from "./bench-route-context"

type BenchContextTarget = BenchReadContextOpenOutput["target"]
type BenchContextRef = BenchReadContextOpenOutput["refs"][number]
type BenchReadSurfaceContextOpenOutput = Pick<
  BenchReadContextOpenOutput,
  "status" | "targetKey" | "target" | "metadata" | "content" | "refs" | "hints"
> &
  Partial<Pick<BenchReadContextOpenOutput, "drawer">>
type BenchSurfaceContextEnrichment = {
  targetStatus: BenchContextTarget["status"]
  title?: string
  metadata: string[]
  content: string
  refs?: BenchContextRef[]
  hints?: string[]
}
type BenchSurfaceContextSnapshot = {
  target: BenchTarget
  targetKey: string
  semanticRevision: number
  context: BenchReadSurfaceContextOpenOutput
}

function routeString(input: { pathname: string; searchStr: string }): string {
  return `${input.pathname}${input.searchStr}`
}

function workspaceFileRef(input: { path: string; note: string }): BenchContextRef {
  return {
    kind: "file",
    value: input.path,
    note: input.note,
  }
}

function objectRef(input: { objectID: string; note: string }): BenchContextRef {
  return {
    kind: "object",
    value: input.objectID,
    note: input.note,
  }
}

function toolRef(input: { tool: string; note: string }): BenchContextRef {
  return {
    kind: "tool",
    value: input.tool,
    note: input.note,
  }
}

function urlRef(input: { url: string | undefined; note: string }): BenchContextRef[] {
  return input.url
    ? [
        {
          kind: "url",
          value: input.url,
          note: input.note,
        },
      ]
    : []
}

function workspaceFileTarget(input: {
  directory: string
  title?: string
  path: string
  route: string
  status: BenchContextTarget["status"]
}): BenchContextTarget {
  return {
    type: "workspace-file",
    title: input.title ?? fileNameFromPath(input.path) ?? input.path,
    workspaceRoot: input.directory,
    path: input.path,
    absolutePath: absoluteWorkspaceFilePath({
      directory: input.directory,
      path: input.path,
    }),
    route: input.route,
    status: input.status,
  }
}

function objectTarget(input: {
  directory: string
  title: string
  target: Extract<BenchTarget, { type: "object" }>
  route: string
  status: BenchContextTarget["status"]
}): BenchContextTarget {
  return {
    type: "object",
    title: input.title,
    workspaceRoot: input.directory,
    ref: input.target.ref,
    viewID: input.target.viewID,
    route: input.route,
    status: input.status,
  }
}

function benchContextTargetFromBenchTarget(input: {
  target: BenchTarget
  directory: string
  route: string
  status: BenchContextTarget["status"]
  title?: string
}): BenchContextTarget {
  if (input.target.type === "workspace-file") {
    return workspaceFileTarget(
      Object.assign(
        {
          directory: input.directory,
          path: input.target.path,
          route: input.route,
          status: input.status,
        },
        input.title ? { title: input.title } : undefined,
      ),
    )
  }

  return objectTarget({
    directory: input.directory,
    title: input.title ?? input.target.ref.objectID,
    target: input.target,
    route: input.route,
    status: input.status,
  })
}

function benchContextRefsFromBenchTarget(target: BenchTarget): BenchContextRef[] {
  if (target.type === "workspace-file") {
    return [
      workspaceFileRef({
        path: target.path,
        note:
          target.viewer === "markdown"
            ? "Markdown file on Bench."
            : "File currently visible on Bench.",
      }),
    ]
  }

  const refs: BenchContextRef[] = [
    objectRef({
      objectID: target.ref.objectID,
      note: `${target.ref.kind} object on Bench.`,
    }),
  ]
  if (target.ref.kind === "whiteboard") {
    refs.push(
      toolRef({
        tool: "whiteboard_read_context",
        note: "Reads precise whiteboard state.",
      }),
    )
  }
  return refs
}

function benchRouteFallbackContextFromTarget(input: {
  target: BenchTarget
  directory: string
  route: string
}): BenchReadSurfaceContextOpenOutput {
  return {
    status: "open",
    targetKey: benchTargetKey(input.target),
    target: benchContextTargetFromBenchTarget({
      target: input.target,
      directory: input.directory,
      route: input.route,
      status: "loading",
    }),
    drawer: null,
    metadata: ["provider: route-fallback", "surface_status: loading"],
    content:
      "The Bench route is open and the surface is still loading or has not registered its live context provider yet.",
    refs: benchContextRefsFromBenchTarget(input.target),
    hints: ["Try bench_read_context again after the Bench surface finishes loading."],
  }
}

function buildBenchSurfaceContextSnapshot(input: {
  target: BenchTarget
  directory: string
  route: string
  semanticRevision: number
  enrichment: BenchSurfaceContextEnrichment
}): BenchSurfaceContextSnapshot {
  return {
    target: input.target,
    targetKey: benchTargetKey(input.target),
    semanticRevision: input.semanticRevision,
    context: {
      status: "open",
      targetKey: benchTargetKey(input.target),
      target: benchContextTargetFromBenchTarget(
        Object.assign(
          {
            target: input.target,
            directory: input.directory,
            route: input.route,
            status: input.enrichment.targetStatus,
          },
          input.enrichment.title ? { title: input.enrichment.title } : undefined,
        ),
      ),
      metadata: input.enrichment.metadata,
      content: input.enrichment.content,
      refs: input.enrichment.refs ?? benchContextRefsFromBenchTarget(input.target),
      hints: input.enrichment.hints ?? [],
    },
  }
}

export {
  benchRouteFallbackContextFromTarget,
  benchContextTargetFromBenchTarget,
  benchContextRefsFromBenchTarget,
  buildBenchSurfaceContextSnapshot,
  objectRef,
  objectTarget,
  routeString,
  toolRef,
  urlRef,
  absoluteWorkspaceFilePath as workspaceAbsolutePath,
  workspaceFileRef,
  workspaceFileTarget,
}

export type {
  BenchReadSurfaceContextOpenOutput,
  BenchSurfaceContextEnrichment,
  BenchSurfaceContextSnapshot,
}
