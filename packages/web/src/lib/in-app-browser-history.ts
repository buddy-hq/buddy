import {
  IN_APP_BROWSER_TITLE_MAX_LENGTH,
  IN_APP_BROWSER_URL_MAX_LENGTH,
} from "@buddy/browser-contract"
import { parseTJsonObject, parseTNumber, parseTString } from "@/components/chat/tools/types"

const MAX_ENTRIES_PER_DIRECTORY = 50
const MAX_DIRECTORIES = 20
const MAX_DATE_TIMESTAMP = 8.64e15

export type InAppBrowserHistoryEntry = {
  readonly url: string
  readonly title: string
  readonly visitedAt: number
}

export type InAppBrowserHistory = Readonly<Record<string, readonly InAppBrowserHistoryEntry[]>>

type DirectoryHistory = readonly [directory: string, entries: readonly InAppBrowserHistoryEntry[]]

export function normalizeInAppBrowserHistoryUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    url.username = ""
    url.password = ""
    return url.href.length <= IN_APP_BROWSER_URL_MAX_LENGTH ? url.href : undefined
  } catch {
    return undefined
  }
}

function newestVisit(entries: readonly InAppBrowserHistoryEntry[]): number {
  return entries[0]?.visitedAt ?? 0
}

function keepRecentDirectories(directories: readonly DirectoryHistory[]): InAppBrowserHistory {
  const kept =
    directories.length <= MAX_DIRECTORIES
      ? directories
      : directories
          .toSorted((left, right) => newestVisit(right[1]) - newestVisit(left[1]))
          .slice(0, MAX_DIRECTORIES)
  return Object.fromEntries(kept)
}

export function recordInAppBrowserVisit(
  history: InAppBrowserHistory,
  visit: { directory: string; url: string; title: string; visitedAt: number },
): InAppBrowserHistory {
  const url = normalizeInAppBrowserHistoryUrl(visit.url)
  if (!url) return history
  const title = visit.title.slice(0, IN_APP_BROWSER_TITLE_MAX_LENGTH)
  const entries = history[visit.directory] ?? []
  const latest = entries[0]
  if (latest?.url === url && latest.title === title && latest.visitedAt === visit.visitedAt) {
    return history
  }
  const nextEntries = [
    { url, title, visitedAt: visit.visitedAt },
    ...entries.filter((entry) => entry.url !== url),
  ].slice(0, MAX_ENTRIES_PER_DIRECTORY)
  return keepRecentDirectories([
    ...Object.entries(history).filter(([directory]) => directory !== visit.directory),
    [visit.directory, nextEntries],
  ])
}

export function removeInAppBrowserVisit(
  history: InAppBrowserHistory,
  input: { directory: string; url: string },
): InAppBrowserHistory {
  if (!history[input.directory]?.some((entry) => entry.url === input.url)) return history
  return Object.fromEntries(
    Object.entries(history).map(([directory, entries]) => [
      directory,
      directory === input.directory ? entries.filter((entry) => entry.url !== input.url) : entries,
    ]),
  )
}

/** Combines persisted and in-memory visits without losing pages recorded during hydration. */
export function mergeInAppBrowserHistory(
  persisted: InAppBrowserHistory,
  current: InAppBrowserHistory,
): InAppBrowserHistory {
  const visits = [persisted, current]
    .flatMap((history) =>
      Object.entries(history).flatMap(([directory, entries]) =>
        entries.map((entry) => ({ directory, ...entry })),
      ),
    )
    .toSorted((left, right) => left.visitedAt - right.visitedAt)
  return visits.reduce<InAppBrowserHistory>(recordInAppBrowserVisit, {})
}

function parseHistoryEntry<TValue>(value: TValue): InAppBrowserHistoryEntry | undefined {
  const record = parseTJsonObject(value)
  const url = normalizeInAppBrowserHistoryUrl(parseTString(record?.url) ?? "")
  const title = parseTString(record?.title)
  const visitedAt = parseTNumber(record?.visitedAt)
  if (
    !url ||
    title === undefined ||
    visitedAt === undefined ||
    !Number.isSafeInteger(visitedAt) ||
    Math.abs(visitedAt) > MAX_DATE_TIMESTAMP
  ) {
    return undefined
  }
  return { url, title: title.slice(0, IN_APP_BROWSER_TITLE_MAX_LENGTH), visitedAt }
}

export function parseInAppBrowserHistory<TValue>(value: TValue): InAppBrowserHistory {
  const directories = Object.entries(parseTJsonObject(value) ?? {}).flatMap(
    ([directory, entries]): DirectoryHistory[] =>
      Array.isArray(entries)
        ? [
            [
              directory,
              entries
                .map(parseHistoryEntry)
                .filter((entry) => entry !== undefined)
                .slice(0, MAX_ENTRIES_PER_DIRECTORY),
            ],
          ]
        : [],
  )
  return keepRecentDirectories(directories)
}
