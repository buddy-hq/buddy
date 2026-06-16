import type { NavigateOptions } from "@tanstack/react-router"
import { decodeDirectory, encodeDirectory } from "@/lib/directory-token"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  isBenchArtifactKind,
  readBenchChatLayoutMode,
  type BenchMode,
  type BenchTarget,
} from "./bench-targets"
import {
  classifyBenchTransition,
  resolveBenchSurfaceDefaults,
  type BenchOpenPolicyState,
} from "./bench-open-policy-core"

const CHAT_ROUTE_CHILD = "chat"
const BENCH_ARTIFACT_ROUTE_CHILD_PREFIX = "artifacts/"
const BENCH_ROUTE_CHILDREN = new Set(["read", "whiteboard", "markdown", "file"])
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

function optionalBenchModeSearch(mode: BenchMode) {
  return withBenchModeSearch(undefined, mode)
}

function readDirectoryChildPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length < 2) return undefined
  return segments.slice(1).join("/")
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
  const childPath = readDirectoryChildPath(pathname)
  if (!childPath) return false
  if (BENCH_ROUTE_CHILDREN.has(childPath)) return true
  return childPath.startsWith(BENCH_ARTIFACT_ROUTE_CHILD_PREFIX)
}

function resolveBenchRouteViewTransitionTypes(
  input: BenchRouteLocationChangeInfo,
): string[] | false {
  if (!input.pathChanged && !input.hrefChanged) return false

  const transition = classifyBenchTransition({
    previous: readBenchOpenPolicyStateFromRouteLocation(input.fromLocation),
    next: readBenchOpenPolicyStateFromRouteLocation(input.toLocation),
  })

  if (transition === "enter") {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_OPEN]
  }

  if (transition === "exit") {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_CLOSE]
  }

  if (transition === "replace" || transition === "replace-and-change-mode") {
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

function readStringSearchValue(
  search: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = search[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readBenchTargetFromLocation(input: {
  pathname: string
  search: unknown
}): BenchTarget | undefined {
  const childPath = readDirectoryChildPath(input.pathname)
  if (!childPath) return undefined

  const search = isUnknownRecord(input.search) ? input.search : {}

  if (childPath === "whiteboard") {
    return { type: "whiteboard" }
  }

  if (childPath === "read") {
    const path = readStringSearchValue(search, "path")
    if (!path) return undefined
    const resourceID = readStringSearchValue(search, "resource")
    return resourceID
      ? { type: "reading", path, resourceID }
      : { type: "reading", path }
  }

  if (childPath === "markdown") {
    const path = readStringSearchValue(search, "path")
    return path ? { type: "markdown", path } : undefined
  }

  if (childPath === "file") {
    const path = readStringSearchValue(search, "path")
    return path ? { type: "file", path } : undefined
  }

  if (!childPath.startsWith(BENCH_ARTIFACT_ROUTE_CHILD_PREFIX)) {
    return undefined
  }

  const segments = childPath.split("/")
  const kind = segments[1]
  const artifactID = segments[2]
  if (!kind || !isBenchArtifactKind(kind) || !artifactID) {
    return undefined
  }

  const itemID = readStringSearchValue(search, "item")
  return itemID
    ? {
        type: "artifact",
        kind,
        artifactID: decodeURIComponent(artifactID),
        itemID,
      }
    : {
        type: "artifact",
        kind,
        artifactID: decodeURIComponent(artifactID),
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

  if (target.type === "reading") {
    return {
      to: "/$directory/read",
      params: { directory: encodedDirectory },
      search: withBenchModeSearch(
        target.resourceID
          ? { path: target.path, resource: target.resourceID }
          : { path: target.path },
        mode,
      ),
    }
  }

  if (target.type === "whiteboard") {
    const search = optionalBenchModeSearch(mode)
    return {
      to: "/$directory/whiteboard",
      params: { directory: encodedDirectory },
      ...(search ? { search } : {}),
    }
  }

  if (target.type === "markdown") {
    return {
      to: "/$directory/markdown",
      params: { directory: encodedDirectory },
      search: withBenchModeSearch({ path: target.path }, mode),
    }
  }

  if (target.type === "file") {
    return {
      to: "/$directory/file",
      params: { directory: encodedDirectory },
      search: withBenchModeSearch({ path: target.path }, mode),
    }
  }

  if (target.kind === "media-presentation") {
    return {
      to: "/$directory/artifacts/media-presentation/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      search: withBenchModeSearch(target.itemID ? { item: target.itemID } : {}, mode),
    }
  }

  if (target.kind === "mermaid") {
    const search = optionalBenchModeSearch(mode)
    return {
      to: "/$directory/artifacts/mermaid/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "html-widget") {
    const search = optionalBenchModeSearch(mode)
    return {
      to: "/$directory/artifacts/html-widget/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "figure") {
    const search = optionalBenchModeSearch(mode)
    return {
      to: "/$directory/artifacts/figure/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "freeform-figure") {
    const search = optionalBenchModeSearch(mode)
    return {
      to: "/$directory/artifacts/freeform-figure/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "question-set") {
    const search = optionalBenchModeSearch(mode)
    return {
      to: "/$directory/artifacts/question-set/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  const search = optionalBenchModeSearch(mode)
  return {
    to: "/$directory/artifacts/flashcard-deck/$artifactID",
    params: { directory: encodedDirectory, artifactID: target.artifactID },
    ...(search ? { search } : {}),
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
