import { useCallback } from "react"
import type { NavigateOptions } from "@tanstack/react-router"
import { useNavigate } from "@tanstack/react-router"
import { encodeDirectory } from "@/lib/directory-token"

export const BENCH_CHAT_SEARCH_PARAM = "benchChat"
export const BENCH_CHAT_LAYOUT_DOCKED = "docked"
export const BENCH_CHAT_LAYOUT_FLOATING = "floating"
const CHAT_ROUTE_CHILD = "chat"
const BENCH_ARTIFACT_ROUTE_CHILD_PREFIX = "artifacts/"
const BENCH_ROUTE_CHILDREN = new Set(["read", "whiteboard", "markdown", "file"])
const BENCH_VIEW_TRANSITION_TYPE_ROUTE = "bench-route"
const BENCH_VIEW_TRANSITION_TYPE_OPEN = "bench-open"
const BENCH_VIEW_TRANSITION_TYPE_CLOSE = "bench-close"
const BENCH_VIEW_TRANSITION_TYPE_SWAP = "bench-swap"

export type BenchArtifactKind =
  | "mermaid"
  | "html-widget"
  | "figure"
  | "freeform-figure"
  | "media-presentation"
  | "question-set"
  | "flashcard-deck"

export type BenchTarget =
  | { type: "reading"; path: string; resourceID?: string }
  | { type: "whiteboard" }
  | { type: "markdown"; path: string }
  | { type: "artifact"; kind: BenchArtifactKind; artifactID: string; itemID?: string }
  | { type: "file"; path: string }

export type BenchChatLayoutMode =
  | typeof BENCH_CHAT_LAYOUT_DOCKED
  | typeof BENCH_CHAT_LAYOUT_FLOATING

type BenchOpenOptions = {
  chatLayout?: BenchChatLayoutMode
}

type BenchRouteLocationChangeInfo = {
  fromLocation?: {
    pathname: string
  }
  toLocation: {
    pathname: string
  }
  pathChanged: boolean
}

export function readBenchChatLayoutMode(value: unknown): BenchChatLayoutMode | undefined {
  return value === BENCH_CHAT_LAYOUT_FLOATING || value === BENCH_CHAT_LAYOUT_DOCKED
    ? value
    : undefined
}

function withBenchChatSearch<TSearch extends Record<string, unknown> | undefined>(
  search: TSearch,
  options: BenchOpenOptions,
) {
  if (options.chatLayout !== BENCH_CHAT_LAYOUT_FLOATING) {
    return search
  }

  return {
    ...search,
    [BENCH_CHAT_SEARCH_PARAM]: BENCH_CHAT_LAYOUT_FLOATING,
  }
}

function optionalBenchChatSearch(options: BenchOpenOptions) {
  return withBenchChatSearch(undefined, options)
}

function readDirectoryChildPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length < 2) return undefined
  return segments.slice(1).join("/")
}

export function isDirectoryChatRoutePathname(pathname: string): boolean {
  return readDirectoryChildPath(pathname) === CHAT_ROUTE_CHILD
}

export function isBenchRoutePathname(pathname: string): boolean {
  const childPath = readDirectoryChildPath(pathname)
  if (!childPath) return false
  if (BENCH_ROUTE_CHILDREN.has(childPath)) return true
  return childPath.startsWith(BENCH_ARTIFACT_ROUTE_CHILD_PREFIX)
}

export function resolveBenchRouteViewTransitionTypes(
  input: BenchRouteLocationChangeInfo,
): string[] | false {
  if (!input.pathChanged) return false

  const fromPathname = input.fromLocation?.pathname
  const fromBench = fromPathname ? isBenchRoutePathname(fromPathname) : false
  const toBench = isBenchRoutePathname(input.toLocation.pathname)
  const fromChat = fromPathname ? isDirectoryChatRoutePathname(fromPathname) : false
  const toChat = isDirectoryChatRoutePathname(input.toLocation.pathname)

  if (fromChat && toBench) {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_OPEN]
  }

  if (fromBench && toChat) {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_CLOSE]
  }

  if (fromBench && toBench) {
    return [BENCH_VIEW_TRANSITION_TYPE_ROUTE, BENCH_VIEW_TRANSITION_TYPE_SWAP]
  }

  return false
}

export function openBench(
  directory: string,
  target: BenchTarget,
  options: BenchOpenOptions = {},
): NavigateOptions {
  const encodedDirectory = encodeDirectory(directory)

  if (target.type === "reading") {
    return {
      to: "/$directory/read",
      params: { directory: encodedDirectory },
      search: withBenchChatSearch(
        target.resourceID
          ? { path: target.path, resource: target.resourceID }
          : { path: target.path },
        options,
      ),
    }
  }

  if (target.type === "whiteboard") {
    const search = optionalBenchChatSearch(options)
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
      search: withBenchChatSearch({ path: target.path }, options),
    }
  }

  if (target.type === "file") {
    return {
      to: "/$directory/file",
      params: { directory: encodedDirectory },
      search: withBenchChatSearch({ path: target.path }, options),
    }
  }

  if (target.kind === "media-presentation") {
    return {
      to: "/$directory/artifacts/media-presentation/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      search: withBenchChatSearch(target.itemID ? { item: target.itemID } : {}, options),
    }
  }

  if (target.kind === "mermaid") {
    const search = optionalBenchChatSearch(options)
    return {
      to: "/$directory/artifacts/mermaid/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "html-widget") {
    const search = optionalBenchChatSearch(options)
    return {
      to: "/$directory/artifacts/html-widget/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "figure") {
    const search = optionalBenchChatSearch(options)
    return {
      to: "/$directory/artifacts/figure/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "freeform-figure") {
    const search = optionalBenchChatSearch(options)
    return {
      to: "/$directory/artifacts/freeform-figure/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  if (target.kind === "question-set") {
    const search = optionalBenchChatSearch(options)
    return {
      to: "/$directory/artifacts/question-set/$artifactID",
      params: { directory: encodedDirectory, artifactID: target.artifactID },
      ...(search ? { search } : {}),
    }
  }

  const search = optionalBenchChatSearch(options)
  return {
    to: "/$directory/artifacts/flashcard-deck/$artifactID",
    params: { directory: encodedDirectory, artifactID: target.artifactID },
    ...(search ? { search } : {}),
  }
}

export function useOpenBench(): (
  directory: string,
  target: BenchTarget,
  options?: BenchOpenOptions,
) => Promise<void> {
  const navigate = useNavigate()

  return useCallback(
    async (directory, target, options) => {
      await navigate(openBench(directory, target, options))
    },
    [navigate],
  )
}
