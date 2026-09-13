import { parseTString } from "@/components/chat/tools/types"
import { useCallback } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import type { SettingsTab } from "@/components/settings/settings-tabs"
import {
  BENCH_WORKSPACE_ROOT_NOTES,
  isDirectoryChatRoutePathname,
  readBenchOpenPolicyStateFromLocation,
} from "@/lib/bench-navigation"
import { decodeDirectory, encodeDirectory } from "@/lib/directory-token"

const SETTINGS_RETURN_ORIGIN = "http://buddy.local"

export type SettingsSearch = {
  tab: SettingsTab
  returnTo?: string
}

function readDirectoryFromReturnPath(pathname: string): string | undefined {
  const token = pathname.split("/").find((segment) => segment.length > 0)
  if (!token) return undefined

  try {
    const directory = decodeDirectory(token)
    return directory.length > 0 && encodeDirectory(directory) === token ? directory : undefined
  } catch {
    return undefined
  }
}

export function readSettingsReturnTo<TValue>(value: TValue): string | undefined {
  const text = parseTString(value)
  if (text === undefined || !text.startsWith("/") || text.startsWith("//")) {
    return undefined
  }

  const url = new URL(text, SETTINGS_RETURN_ORIGIN)
  if (url.origin !== SETTINGS_RETURN_ORIGIN || url.hash) return undefined
  if (url.pathname === "/chat") return `${url.pathname}${url.search}`

  const directory = readDirectoryFromReturnPath(url.pathname)
  if (!directory) return undefined
  const isDirectoryChat = isDirectoryChatRoutePathname(url.pathname)
  const benchState = readBenchOpenPolicyStateFromLocation({
    directory,
    pathname: url.pathname,
    search: Object.fromEntries(url.searchParams),
  })
  if (!isDirectoryChat && benchState.status !== "open") return undefined

  return `${url.pathname}${url.search}`
}

function isNotesBenchReturnTo(returnTo: string): boolean {
  const url = new URL(returnTo, SETTINGS_RETURN_ORIGIN)
  const directory = readDirectoryFromReturnPath(url.pathname)
  if (!directory) return false
  const benchState = readBenchOpenPolicyStateFromLocation({
    directory,
    pathname: url.pathname,
    search: Object.fromEntries(url.searchParams),
  })
  return (
    benchState.status === "open" &&
    benchState.target.type === "workspace-file" &&
    benchState.target.root === BENCH_WORKSPACE_ROOT_NOTES
  )
}

export function dropNotesBenchSettingsReturnTo(returnTo: string | undefined): string | undefined {
  const validated = readSettingsReturnTo(returnTo)
  if (!validated || !isNotesBenchReturnTo(validated)) return validated
  return undefined
}

export function buildSettingsSearch(input: { tab: SettingsTab; returnTo: string }): SettingsSearch {
  const returnTo = readSettingsReturnTo(input.returnTo)
  return Object.assign(
    {
      tab: input.tab,
    },
    returnTo ? { returnTo } : undefined,
  )
}

export function settingsSearchForTab(
  search: { returnTo?: unknown },
  tab: SettingsTab,
): SettingsSearch {
  const returnTo = readSettingsReturnTo(search.returnTo)
  return Object.assign(
    {
      tab,
    },
    returnTo ? { returnTo } : undefined,
  )
}

export function resolveSettingsReturnLocation(input: {
  returnTo?: string
  activeDirectory?: string
}): string {
  const returnTo = readSettingsReturnTo(input.returnTo)
  if (returnTo) return returnTo
  if (input.activeDirectory) {
    return `/${encodeDirectory(input.activeDirectory)}/chat`
  }
  return "/chat"
}

export function useOpenSettings(): (tab: SettingsTab) => void {
  const location = useLocation()
  const navigate = useNavigate()
  const returnTo = `${location.pathname}${location.searchStr}`

  return useCallback(
    (tab) => {
      void navigate({
        to: "/settings",
        search: buildSettingsSearch({ tab, returnTo }),
      })
    },
    [navigate, returnTo],
  )
}
