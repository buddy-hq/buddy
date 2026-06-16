import { fileNameFromPath } from "@/lib/workspace-file-paths"
import type { BenchTarget } from "@/lib/bench-navigation"
import type { BenchReadContextOpenOutput } from "./bench-route-context"

type BenchContextTarget = BenchReadContextOpenOutput["target"]
type BenchContextRef = BenchReadContextOpenOutput["refs"][number]

const POSIX_PATH_SEPARATOR = "/"
const WINDOWS_PATH_SEPARATOR = "\\"

function workspaceAbsolutePath(input: { directory: string; path: string }): string {
  const normalizedDirectory = input.directory.replace(/[\\/]+$/u, "")
  const normalizedPath = input.path.replace(/^[/\\]+/u, "")
  const separator = normalizedDirectory.includes(WINDOWS_PATH_SEPARATOR)
    ? WINDOWS_PATH_SEPARATOR
    : POSIX_PATH_SEPARATOR
  return `${normalizedDirectory}${separator}${normalizedPath.replace(/[\\/]+/gu, separator)}`
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

function artifactRef(input: { artifactID: string; note: string }): BenchContextRef {
  return {
    kind: "artifact",
    value: input.artifactID,
    note: input.note,
  }
}

function resourceRef(input: { resourceID: string; note: string }): BenchContextRef {
  return {
    kind: "resource",
    value: input.resourceID,
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

function workspaceBackedTarget(input: {
  type: "reading" | "markdown" | "file"
  directory: string
  title?: string
  path: string
  route: string
  status: BenchContextTarget["status"]
  resourceID?: string
}): BenchContextTarget {
  return {
    type: input.type,
    artifactKind: "none",
    title: input.title ?? fileNameFromPath(input.path) ?? input.path,
    workspaceRoot: input.directory,
    path: input.path,
    absolutePath: workspaceAbsolutePath({
      directory: input.directory,
      path: input.path,
    }),
    resourceID: input.resourceID ?? null,
    artifactID: null,
    itemID: null,
    route: input.route,
    status: input.status,
  }
}

function whiteboardTarget(input: { directory: string; route: string }): BenchContextTarget {
  return {
    type: "whiteboard",
    artifactKind: "none",
    title: "Whiteboard",
    workspaceRoot: input.directory,
    path: null,
    absolutePath: null,
    resourceID: null,
    artifactID: null,
    itemID: null,
    route: input.route,
    status: "ready",
  }
}

function artifactTarget(input: {
  artifactKind: Exclude<BenchContextTarget["artifactKind"], "none">
  directory: string
  title: string
  artifactID: string
  route: string
  status: BenchContextTarget["status"]
  itemID?: string
}): BenchContextTarget {
  return {
    type: "artifact",
    artifactKind: input.artifactKind,
    title: input.title,
    workspaceRoot: input.directory,
    path: null,
    absolutePath: null,
    resourceID: null,
    artifactID: input.artifactID,
    itemID: input.itemID ?? null,
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
  if (input.target.type === "reading") {
    return workspaceBackedTarget({
      type: "reading",
      directory: input.directory,
      path: input.target.path,
      route: input.route,
      status: input.status,
      ...(input.title ? { title: input.title } : {}),
      ...(input.target.resourceID ? { resourceID: input.target.resourceID } : {}),
    })
  }

  if (input.target.type === "markdown") {
    return workspaceBackedTarget({
      type: "markdown",
      directory: input.directory,
      path: input.target.path,
      route: input.route,
      status: input.status,
      ...(input.title ? { title: input.title } : {}),
    })
  }

  if (input.target.type === "file") {
    return workspaceBackedTarget({
      type: "file",
      directory: input.directory,
      path: input.target.path,
      route: input.route,
      status: input.status,
      ...(input.title ? { title: input.title } : {}),
    })
  }

  if (input.target.type === "whiteboard") {
    return {
      ...whiteboardTarget({
        directory: input.directory,
        route: input.route,
      }),
      status: input.status,
    }
  }

  return artifactTarget({
    artifactKind: input.target.kind,
    directory: input.directory,
    title: input.title ?? input.target.artifactID,
    artifactID: input.target.artifactID,
    route: input.route,
    status: input.status,
    ...(input.target.itemID ? { itemID: input.target.itemID } : {}),
  })
}

function benchContextRefsFromBenchTarget(target: BenchTarget): BenchContextRef[] {
  if (target.type === "reading") {
    const refs: BenchContextRef[] = [
      workspaceFileRef({
        path: target.path,
        note: "Reading file on Bench.",
      }),
    ]
    if (target.resourceID) {
      refs.push(
        resourceRef({
          resourceID: target.resourceID,
          note: "Prepared reading resource id.",
        }),
      )
    }
    return refs
  }

  if (target.type === "markdown") {
    return [
      workspaceFileRef({
        path: target.path,
        note: "Markdown file on Bench.",
      }),
    ]
  }

  if (target.type === "file") {
    return [
      workspaceFileRef({
        path: target.path,
        note: "File currently visible on Bench.",
      }),
    ]
  }

  if (target.type === "whiteboard") {
    return [
      toolRef({
        tool: "whiteboard_read_context",
        note: "Reads precise whiteboard state.",
      }),
    ]
  }

  return [
    artifactRef({
      artifactID: target.artifactID,
      note: `${target.kind} artifact on Bench.`,
    }),
  ]
}

export {
  artifactRef,
  artifactTarget,
  benchContextTargetFromBenchTarget,
  benchContextRefsFromBenchTarget,
  routeString,
  resourceRef,
  toolRef,
  urlRef,
  whiteboardTarget,
  workspaceAbsolutePath,
  workspaceBackedTarget,
  workspaceFileRef,
}
