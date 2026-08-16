import type { NavigateOptions } from "@tanstack/react-router"
import { parseTJsonObject, readNonEmptyString } from "@/components/chat/tools/types"
import { decodeDirectory, encodeDirectory } from "@/lib/directory-token"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  defaultBenchObjectViewID,
  isBenchObjectKind,
  readBenchChatLayoutMode,
  type BenchMode,
  type BenchTabTarget,
} from "./bench-targets"
import { resolveBenchSurfaceDefaults, type BenchOpenPolicyState } from "./bench-open-policy-core"

const CHAT_ROUTE_CHILD = "chat"
const BENCH_ROUTE_GROUP_CHILD = "_bench"
const BENCH_SESSION_ROUTE_CHILD = "sessions"
const BENCH_SESSION_ROUTE_CHILD_PREFIX = `${BENCH_SESSION_ROUTE_CHILD}/`
const BENCH_OBJECT_ROUTE_CHILD = "objects"
const BENCH_OBJECT_ROUTE_CHILD_PREFIX = `${BENCH_OBJECT_ROUTE_CHILD}/`
const BENCH_ROUTE_CHILDREN = new Set(["markdown", "file"])
const BENCH_VIEW_TRANSITION_TYPE_ROUTE = "bench-route"
const BENCH_VIEW_TRANSITION_TYPE_OPEN = "bench-open"
const BENCH_VIEW_TRANSITION_TYPE_CLOSE = "bench-close"

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

function withBenchModeSearch<TSearch>(search: TSearch, mode: BenchMode) {
  if (mode !== BENCH_CHAT_LAYOUT_FLOATING) {
    return search
  }

  return Object.assign({}, search, {
    [BENCH_CHAT_SEARCH_PARAM]: BENCH_CHAT_LAYOUT_FLOATING,
  })
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
  if (childPath.startsWith(BENCH_SESSION_ROUTE_CHILD_PREFIX)) {
    const segments = childPath.split("/")
    return segments.length === 2 && segments[1] !== undefined && segments[1].length > 0
  }
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

function readStringSearchValue<TSearch>(search: TSearch, key: string): string | undefined {
  const record = parseTJsonObject(search)
  if (!record) return undefined
  return readNonEmptyString(record[key])
}

function readBenchTargetFromLocation<TSearch>(input: {
  pathname: string
  search: TSearch
}): BenchTabTarget | undefined {
  const rawChildPath = readDirectoryChildPath(input.pathname)
  if (!rawChildPath) return undefined
  const childPath = normalizeBenchChildPath(rawChildPath)
  if (!childPath || childPath === BENCH_ROUTE_GROUP_CHILD) return undefined

  const search = parseTJsonObject(input.search) ?? {}

  if (childPath === "markdown") {
    const path = readStringSearchValue(search, "path")
    const fragment = readStringSearchValue(search, "fragment")
    return path
      ? Object.assign(
          {
            type: "workspace-file" as const,
            path,
            viewer: "markdown" as const,
          },
          fragment ? { fragment } : undefined,
        )
      : undefined
  }

  if (childPath === "file") {
    const path = readStringSearchValue(search, "path")
    const fragment = readStringSearchValue(search, "fragment")
    return path
      ? Object.assign(
          {
            type: "workspace-file" as const,
            path,
            viewer: "file" as const,
          },
          fragment ? { fragment } : undefined,
        )
      : undefined
  }

  if (childPath.startsWith(BENCH_SESSION_ROUTE_CHILD_PREFIX)) {
    const segments = childPath.split("/")
    const sessionID = segments[1]
    return segments.length === 2 && sessionID
      ? { type: "session", sessionID: decodeURIComponent(sessionID) }
      : undefined
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

function readBenchOpenPolicyStateFromLocation<TSearch>(input: {
  directory: string
  pathname: string
  search: TSearch
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

  const search = parseTJsonObject(input.search) ?? {}
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
  target: BenchTabTarget
  mode: BenchMode
}): NavigateOptions {
  const encodedDirectory = encodeDirectory(input.directory)
  const { mode, target } = input

  if (target.type === "session") {
    return {
      to: "/$directory/sessions/$sessionID",
      params: { directory: encodedDirectory, sessionID: target.sessionID },
      search: withBenchModeSearch({}, mode),
    }
  }

  if (target.type === "workspace-file") {
    const to = target.viewer === "markdown" ? "/$directory/markdown" : "/$directory/file"
    return {
      to,
      params: { directory: encodedDirectory },
      search: withBenchModeSearch(
        Object.assign(
          { path: target.path },
          target.fragment ? { fragment: target.fragment } : undefined,
        ),
        mode,
      ),
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
      Object.assign(
        { view: target.viewID },
        target.ref.revisionID ? { revision: target.ref.revisionID } : undefined,
        target.ref.itemID ? { item: target.ref.itemID } : undefined,
      ),
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
