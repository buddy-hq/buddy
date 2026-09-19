import { create } from "zustand"
import { persist } from "zustand/middleware"
import { parseTJsonObject } from "@/components/chat/tools/types"
import { createPlatformJsonStorage } from "@/context/platform"
import {
  mergeInAppBrowserHistory,
  parseInAppBrowserHistory,
  recordInAppBrowserVisit,
  removeInAppBrowserVisit,
  type InAppBrowserHistory,
} from "@/lib/in-app-browser-history"

const IN_APP_BROWSER_HISTORY_STORAGE_KEY = "buddy.in-app-browser-history.v1"
const IN_APP_BROWSER_HISTORY_STORAGE_FILE = "buddy.in-app-browser-history.dat"

type InAppBrowserHistoryState = {
  byDirectory: InAppBrowserHistory
  recordVisit(visit: { directory: string; url: string; title: string; visitedAt: number }): void
  removeVisit(input: { directory: string; url: string }): void
}

export type InAppBrowserHistoryHydrationStatus = "hydrating" | "hydrated" | "failed"

let hydrationStatus: InAppBrowserHistoryHydrationStatus = "hydrating"
let hydrationAttempt = 0
let pendingVisits: InAppBrowserHistory = {}
const pendingRemovals = new Map<string, Set<string>>()

function beginHydration(): number {
  hydrationAttempt += 1
  hydrationStatus = "hydrating"
  return hydrationAttempt
}

function queueVisit(visit: {
  directory: string
  url: string
  title: string
  visitedAt: number
}): void {
  pendingVisits = recordInAppBrowserVisit(pendingVisits, visit)
  pendingRemovals.get(visit.directory)?.delete(visit.url)
}

function queueRemoval(input: { directory: string; url: string }): void {
  pendingVisits = removeInAppBrowserVisit(pendingVisits, input)
  const removals = pendingRemovals.get(input.directory) ?? new Set<string>()
  removals.add(input.url)
  pendingRemovals.set(input.directory, removals)
}

export const useInAppBrowserHistoryStore = create<InAppBrowserHistoryState>()(
  persist(
    (set) => ({
      byDirectory: {},
      recordVisit(visit) {
        if (hydrationStatus !== "hydrated") {
          queueVisit(visit)
          return
        }
        set((state) => {
          const byDirectory = recordInAppBrowserVisit(state.byDirectory, visit)
          return byDirectory === state.byDirectory ? state : { byDirectory }
        })
      },
      removeVisit(input) {
        if (hydrationStatus !== "hydrated") {
          queueRemoval(input)
          return
        }
        set((state) => {
          const byDirectory = removeInAppBrowserVisit(state.byDirectory, input)
          return byDirectory === state.byDirectory ? state : { byDirectory }
        })
      },
    }),
    {
      name: IN_APP_BROWSER_HISTORY_STORAGE_KEY,
      storage: createPlatformJsonStorage(IN_APP_BROWSER_HISTORY_STORAGE_FILE),
      partialize: (state) => ({ byDirectory: state.byDirectory }),
      merge: (persisted, current) => ({
        ...current,
        byDirectory: mergeInAppBrowserHistory(
          parseInAppBrowserHistory(parseTJsonObject(persisted)?.byDirectory),
          current.byDirectory,
        ),
      }),
      onRehydrateStorage: () => {
        const attempt = beginHydration()
        return (_state, error) => {
          if (attempt !== hydrationAttempt) return
          if (error) {
            hydrationStatus = "failed"
            return
          }
          queueMicrotask(() => {
            if (attempt !== hydrationAttempt) return
            const hasPending = Object.keys(pendingVisits).length > 0 || pendingRemovals.size > 0
            const visits = pendingVisits
            const removals = new Map(pendingRemovals)
            pendingVisits = {}
            pendingRemovals.clear()
            hydrationStatus = "hydrated"
            if (!hasPending) return
            useInAppBrowserHistoryStore.setState((state) => {
              let byDirectory = state.byDirectory
              for (const [directory, urls] of removals) {
                for (const url of urls) {
                  byDirectory = removeInAppBrowserVisit(byDirectory, { directory, url })
                }
              }
              byDirectory = mergeInAppBrowserHistory(byDirectory, visits)
              return byDirectory === state.byDirectory ? state : { byDirectory }
            })
          })
        }
      },
    },
  ),
)

/** Reports whether history is safe to read from and write to durable storage. */
export function getInAppBrowserHistoryHydrationStatus(): InAppBrowserHistoryHydrationStatus {
  return hydrationStatus
}
