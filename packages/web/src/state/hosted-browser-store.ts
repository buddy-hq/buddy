import { create } from "zustand"
import type { InAppBrowserProfileID } from "@buddy/browser-contract/profiles"
import type { BenchTarget } from "@/lib/bench-targets"
import type { WorkspaceChatKey } from "@/lib/workspace-chat-key"
import type { WorkspacePresentationSlot } from "@/state/directory-workspace-store"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"
import type { WithInAppBrowserWebview } from "@/components/bench/surfaces/browser/in-app-browser-webview"
import type { useBrowserPageControls } from "@/components/bench/surfaces/browser/use-browser-page-controls"
import {
  removeNotesBenchTargetsFromSlots,
  removeSessionBenchTargetsFromSlots,
  type NotesBenchTargetMatcher,
} from "@/state/directory-workspace-store"

type BrowserTarget = Extract<BenchTarget, { type: "browser" }>

/** Live page controls and status shared with the routed Bench toolbar. */
export type HostedBrowserPage = {
  readonly profileID: InAppBrowserProfileID
  readonly runtime: InAppBrowserTabRuntime
  readonly notice: string | null
  readonly webContentsID: number | null
  readonly observedPageUrl: string
  readonly withWebview: WithInAppBrowserWebview
  readonly navigateUrl: (url: string) => boolean
  readonly submitInput: (value: string) => boolean
  readonly reload: () => void
  readonly hardReload: () => void
  readonly controls: ReturnType<typeof useBrowserPageControls>
}

/** Viewport coordinates occupied by a routed Browser page slot. */
export type BrowserSurfaceRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type BrowserSurface = {
  readonly owner: symbol | null
  readonly rect: BrowserSurfaceRect | null
  readonly visible: boolean
  readonly clipRight: number
}

type HostedBrowserTarget = {
  readonly directory: string
  readonly target: BrowserTarget
}

type DirectorySlots = Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>

type HostedBrowserState = {
  readonly slotsByDirectory: Record<string, DirectorySlots>
  readonly targetsByKey: Record<string, HostedBrowserTarget>
  readonly surfacesByKey: Record<string, BrowserSurface>
  readonly pagesByKey: Record<string, HostedBrowserPage>
  rememberDirectory(directory: string, slots: DirectorySlots): void
  replaceSlot(directory: string, chatKey: WorkspaceChatKey, slot: WorkspacePresentationSlot): void
  removeSessionTargets(directory: string, sessionIDs: readonly string[]): void
  forgetDirectory(directory: string): void
  invalidateNotesTargets(matches?: NotesBenchTargetMatcher): void
  claimSurface(key: string, owner: symbol): void
  presentSurface(
    key: string,
    owner: symbol,
    rect: BrowserSurfaceRect,
    visible: boolean,
    clipRight: number,
  ): boolean
  releaseSurface(key: string, owner: symbol): void
  setPage(key: string, page: HostedBrowserPage): void
  removePage(key: string): void
  reset(): void
}

/** Distinguishes tabs with the same ID in different notebooks. */
export function hostedBrowserKey(directory: string, tabID: string): string {
  return `${encodeURIComponent(directory)}:${encodeURIComponent(tabID)}`
}

function browserTargetsForDirectory(directory: string, slots: DirectorySlots) {
  const targets: Record<string, HostedBrowserTarget> = {}
  for (const slot of Object.values(slots)) {
    for (const tab of slot?.tabs ?? []) {
      if (tab.target.type !== "browser") continue
      targets[hostedBrowserKey(directory, tab.target.tabID)] = { directory, target: tab.target }
    }
  }
  return targets
}

function withDirectorySlots(
  state: HostedBrowserState,
  directory: string,
  slots: DirectorySlots,
): Pick<HostedBrowserState, "slotsByDirectory" | "targetsByKey"> {
  const targetsByKey = { ...state.targetsByKey }
  const nextTargets = browserTargetsForDirectory(directory, slots)
  for (const [key, entry] of Object.entries(targetsByKey)) {
    if (entry.directory === directory && !(key in nextTargets)) delete targetsByKey[key]
  }
  Object.assign(targetsByKey, nextTargets)
  return {
    slotsByDirectory: { ...state.slotsByDirectory, [directory]: slots },
    targetsByKey,
  }
}

function sameRect(left: BrowserSurfaceRect | null, right: BrowserSurfaceRect): boolean {
  return (
    left?.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

/** Keeps browser pages and workspace tabs alive while notebook routes are unmounted. */
export const useHostedBrowserStore = create<HostedBrowserState>()((set) => ({
  slotsByDirectory: {},
  targetsByKey: {},
  surfacesByKey: {},
  pagesByKey: {},
  rememberDirectory(directory, slots) {
    set((state) => {
      if (state.slotsByDirectory[directory] === slots) return state
      return withDirectorySlots(state, directory, slots)
    })
  },
  replaceSlot(directory, chatKey, slot) {
    set((state) => {
      const slots = state.slotsByDirectory[directory]
      if (!slots) return state
      return withDirectorySlots(state, directory, { ...slots, [chatKey]: slot })
    })
  },
  removeSessionTargets(directory, sessionIDs) {
    set((state) => {
      const slots = state.slotsByDirectory[directory]
      if (!slots) return state
      const nextSlots = removeSessionBenchTargetsFromSlots({
        slots,
        sessionIDs: new Set(sessionIDs),
      })
      if (nextSlots === slots) return state
      return withDirectorySlots(state, directory, nextSlots)
    })
  },
  forgetDirectory(directory) {
    set((state) => {
      const targetsByKey = { ...state.targetsByKey }
      const surfacesByKey = { ...state.surfacesByKey }
      const pagesByKey = { ...state.pagesByKey }
      for (const [key, entry] of Object.entries(state.targetsByKey)) {
        if (entry.directory !== directory) continue
        delete targetsByKey[key]
        delete surfacesByKey[key]
        delete pagesByKey[key]
      }
      const slotsByDirectory = { ...state.slotsByDirectory }
      delete slotsByDirectory[directory]
      return {
        slotsByDirectory,
        targetsByKey,
        surfacesByKey,
        pagesByKey,
      }
    })
  },
  invalidateNotesTargets(matches) {
    set((state) => {
      let changed = false
      const slotsByDirectory = { ...state.slotsByDirectory }
      for (const [directory, slots] of Object.entries(state.slotsByDirectory)) {
        const nextSlots = removeNotesBenchTargetsFromSlots(slots, matches)
        if (nextSlots === slots) continue
        slotsByDirectory[directory] = nextSlots
        changed = true
      }
      return changed ? { slotsByDirectory } : state
    })
  },
  claimSurface(key, owner) {
    set((state) => ({
      surfacesByKey: {
        ...state.surfacesByKey,
        [key]: {
          owner,
          rect: state.surfacesByKey[key]?.rect ?? null,
          visible: false,
          clipRight: 0,
        },
      },
    }))
  },
  presentSurface(key, owner, rect, visible, clipRight) {
    if (useHostedBrowserStore.getState().surfacesByKey[key]?.owner !== owner) return false
    set((state) => {
      const current = state.surfacesByKey[key]
      if (current?.owner !== owner) return state
      if (
        current.visible === visible &&
        current.clipRight === clipRight &&
        sameRect(current.rect, rect)
      ) {
        return state
      }
      return {
        surfacesByKey: {
          ...state.surfacesByKey,
          [key]: { owner, rect, visible, clipRight },
        },
      }
    })
    return true
  },
  releaseSurface(key, owner) {
    set((state) => {
      const current = state.surfacesByKey[key]
      if (current?.owner !== owner) return state
      return {
        surfacesByKey: {
          ...state.surfacesByKey,
          [key]: { ...current, owner: null, visible: false },
        },
      }
    })
  },
  setPage(key, page) {
    set((state) => ({ pagesByKey: { ...state.pagesByKey, [key]: page } }))
  },
  removePage(key) {
    set((state) => {
      if (!(key in state.pagesByKey)) return state
      const { [key]: _removed, ...pagesByKey } = state.pagesByKey
      return { pagesByKey }
    })
  },
  reset() {
    set({
      slotsByDirectory: {},
      targetsByKey: {},
      surfacesByKey: {},
      pagesByKey: {},
    })
  },
}))
