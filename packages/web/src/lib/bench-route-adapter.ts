import type { NavigateOptions } from "@tanstack/react-router"
import { decodeDirectory, encodeDirectory } from "@/lib/directory-token"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  defaultBenchObjectViewID,
  isBenchObjectKind,
  isSameBenchTarget,
  readBenchChatLayoutMode,
  type BenchMode,
  type BenchTarget,
} from "./bench-targets"
import { resolveBenchSurfaceDefaults, type BenchOpenPolicyState } from "./bench-open-policy-core"

const CHAT_ROUTE_CHILD = "chat"
const BENCH_ROUTE_GROUP_CHILD = "_bench"
const BENCH_OBJECT_ROUTE_CHILD = "objects"
const BENCH_OBJECT_ROUTE_CHILD_PREFIX = `${BENCH_OBJECT_ROUTE_CHILD}/`
const BENCH_ROUTE_CHILDREN = new Set(["markdown", "file"])
const BENCH_VIEW_TRANSITION_TYPE_ROUTE = "bench-route"
const BENCH_VIEW_TRANSITION_TYPE_OPEN = "bench-open"
const BENCH_VIEW_TRANSITION_TYPE_CLOSE = "bench-close"
const BENCH_VIEW_TRANSITION_TYPE_SWAP = "bench-swap"

type BenchRouteLocationChangeInfo = {
  fromLocation?: {
    pathname: string
    search?: unknown
  }
  toLocation: {
    pathname: string
    search?: unknown
  }
  pathChanged: boolean
  hrefChanged?: boolean
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function withBenchModeSearch<TSearch extends Record<string, unknown> | undefined>(
  search: TSearch,
  mode: BenchMode,
) {
  if (mode !== BENCH_CHAT_LAYOUT_FLOATING) {
    return search
  }

  return {
    ...search,
    [BENCH_CHAT_SEARCH_PARAM]: BENCH_CHAT_LAYOUT_FLOATING,
  }
}

function readDirectoryChildPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length < 2) return undefined
  return segments.slice(1).join("/")
}

function normalizeBenchChildPath(childPath: string): string {
  if (childPath.startsWith(`${BENCH_ROUTE_GROUP_CHILD}/`)) {
    return childPath.slice(BENCH_ROUTE_GROUP_CHILD.length + 1)
  }
  return childPath
}

function readEncodedDirectoryPathSegment(pathname: string): string | undefined {
  return pathname.split("/").find((segment) => segment.length > 0)
}

function readDirectoryFromPathname(pathname: string): string | undefined {
  const encodedDirectory = readEncodedDirectoryPathSegment(pathname)
  if (!encodedDirectory) return undefined

  try {
    return decodeDirectory(encodedDirectory)
  } catch {
    return undefined
  }
}

function isDirectoryChatRoutePathname(pathname: string): boolean {
  return readDirectoryChildPath(pathname) === CHAT_ROUTE_CHILD
}

function isBenchRoutePathname(pathname: string): boolean {
  const rawChildPath = readDirectoryChildPath(pathname)
  if (!rawChildPath) return false
  if (rawChildPath === BENCH_ROUTE_GROUP_CHILD) return true
  const childPath = normalizeBenchChildPath(rawChildPath)
  if (BENCH_ROUTE_CHILDREN.has(childPath)) return true
  if (!childPath.startsWith(BENCH_OBJECT_ROUTE_CHILD_PREFIX)) return false

  const segments = childPath.split("/")
  const kind = segments[1]
  const objectID = segments[2]
  return (
    segments.length === 3 &&
    segments[0] === BENCH_OBJECT_ROUTE_CHILD &&
    kind !== undefined &&
    isBenchObjectKind(kind) &&
    objectID !== undefined &&
    objectID.length > 0
  )
}

function resolveBenchRouteViewTransitionTypes(
  input: BenchRouteLocationChangeInfo,
): string[] | false {
  if (!input.pathChanged && !input.hrefChanged) return false

  const previous = readBenchOpenPolicyStateFromRouteLocation(input.fromLocation)
  const next = readBenchOpenPolicyStateFromRouteLocation(input.toLocation)

  if (previous.status === "closed" && next.status === "open") {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_OPEN]
  }

  if (previous.status === "open" && next.status === "closed") {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_CLOSE]
  }

  if (
    previous.status === "open" &&
    next.status === "open" &&
    (previous.directory !== next.directory || !isSameBenchTarget(previous.target, next.target))
  ) {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_SWAP]
  }

  return false
}

function readBenchOpenPolicyStateFromRouteLocation(
  location: BenchRouteLocationChangeInfo["fromLocation"],
): BenchOpenPolicyState {
  if (!location) return { status: "closed" }
  const directory = readDirectoryFromPathname(location.pathname)
  if (!directory) return { status: "closed" }
  return readBenchOpenPolicyStateFromLocation({
    directory,
    pathname: location.pathname,
    search: location.search,
  })
}

function readStringSearchValue(search: Record<string, unknown>, key: string): string | undefined {
  const value = search[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readBenchTargetFromLocation(input: {
  pathname: string
  search: unknown
}): BenchTarget | undefined {
  const rawChildPath = readDirectoryChildPath(input.pathname)
  if (!rawChildPath) return undefined
  const childPath = normalizeBenchChildPath(rawChildPath)
  if (!childPath || childPath === BENCH_ROUTE_GROUP_CHILD) return undefined

  const search = isUnknownRecord(input.search) ? input.search : {}

  if (childPath === "markdown") {
    const path = readStringSearchValue(search, "path")
    return path ? { type: "workspace-file", path, viewer: "markdown" } : undefined
  }

  if (childPath === "file") {
    const path = readStringSearchValue(search, "path")
    return path ? { type: "workspace-file", path, viewer: "file" } : undefined
  }

  if (!childPath.startsWith(BENCH_OBJECT_ROUTE_CHILD_PREFIX)) {
    return undefined
  }

  const segments = childPath.split("/")
  if (segments.length !== 3 || segments[0] !== BENCH_OBJECT_ROUTE_CHILD) {
    return undefined
  }

  const kind = segments[1]
  const objectID = segments[2]
  if (!kind || !isBenchObjectKind(kind) || !objectID) {
    return undefined
  }

  const viewID = readStringSearchValue(search, "view") ?? defaultBenchObjectViewID(kind)
  const revisionID = readStringSearchValue(search, "revision") ?? null
  const itemID = readStringSearchValue(search, "item")
  return {
    type: "object",
    ref: {
      kind,
      objectID: decodeURIComponent(objectID),
      revisionID,
      itemID: itemID ?? null,
    },
    viewID,
  }
}

function readBenchOpenPolicyStateFromLocation(input: {
  directory: string
  pathname: string
  search: unknown
}): BenchOpenPolicyState {
  if (readEncodedDirectoryPathSegment(input.pathname) !== encodeDirectory(input.directory)) {
    return { status: "closed" }
  }

  const target = readBenchTargetFromLocation({
    pathname: input.pathname,
    search: input.search,
  })
  if (!target) {
    return { status: "closed" }
  }

  const search = isUnknownRecord(input.search) ? input.search : {}
  const mode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM]) ?? BENCH_CHAT_LAYOUT_DOCKED
  return {
    status: "open",
    directory: input.directory,
    target,
    mode,
    layoutProfile: resolveBenchSurfaceDefaults(target).layoutProfile,
  }
}

function buildBenchNavigation(input: {
  directory: string
  target: BenchTarget
  mode: BenchMode
}): NavigateOptions {
  const encodedDirectory = encodeDirectory(input.directory)
  const { mode, target } = input

  if (target.type === "workspace-file") {
    const to = target.viewer === "markdown" ? "/$directory/markdown" : "/$directory/file"
    return {
      to,
      params: { directory: encodedDirectory },
      search: withBenchModeSearch({ path: target.path }, mode),
    }
  }

  return {
    to: "/$directory/objects/$kind/$objectID",
    params: {
      directory: encodedDirectory,
      kind: target.ref.kind,
      objectID: target.ref.objectID,
    },
    search: withBenchModeSearch(
      {
        view: target.viewID,
        ...(target.ref.revisionID ? { revision: target.ref.revisionID } : {}),
        ...(target.ref.itemID ? { item: target.ref.itemID } : {}),
      },
      mode,
    ),
  }
}

export {
  buildBenchNavigation,
  isBenchRoutePathname,
  isDirectoryChatRoutePathname,
  readBenchOpenPolicyStateFromLocation,
  readBenchTargetFromLocation,
  resolveBenchRouteViewTransitionTypes,
}
