import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { createPlatformJsonStorage } from "@/context/platform"

type NotificationBase = {
  directory?: string
  session?: string
  time: number
  viewed: boolean
}

export type TurnCompleteNotification = NotificationBase & {
  type: "turn-complete"
}

export type ErrorNotification = NotificationBase & {
  type: "error"
  error?: unknown
}

export type BuddyNotification = TurnCompleteNotification | ErrorNotification

type NotificationIndexScope = {
  all: Record<string, BuddyNotification[]>
  unseen: Record<string, BuddyNotification[]>
  unseenCount: Record<string, number>
  unseenHasError: Record<string, boolean>
}

type NotificationIndex = {
  session: NotificationIndexScope
  project: NotificationIndexScope
}

type NotificationsStore = {
  list: BuddyNotification[]
  index: NotificationIndex
  append: (notification: BuddyNotification) => void
  markSessionViewed: (session: string) => void
  markProjectViewed: (directory: string) => void
  sessionUnseenCount: (session: string) => number
  sessionUnseenHasError: (session: string) => boolean
  projectUnseenCount: (directory: string) => number
  projectUnseenHasError: (directory: string) => boolean
}

const NOTIFICATIONS_STORAGE_FILE = "buddy.notifications.history.dat"
const NOTIFICATIONS_STORAGE_KEY = "buddy.notifications.history.v1"
const MAX_NOTIFICATIONS = 500
const NOTIFICATION_TTL_MS = 1000 * 60 * 60 * 24 * 30

function createNotificationIndex(): NotificationIndex {
  return {
    session: {
      all: {},
      unseen: {},
      unseenCount: {},
      unseenHasError: {},
    },
    project: {
      all: {},
      unseen: {},
      unseenCount: {},
      unseenHasError: {},
    },
  }
}

function pruneNotifications(list: BuddyNotification[]) {
  const cutoff = Date.now() - NOTIFICATION_TTL_MS
  const pruned = list.filter((notification) => notification.time >= cutoff)
  if (pruned.length <= MAX_NOTIFICATIONS) return pruned
  return pruned.slice(pruned.length - MAX_NOTIFICATIONS)
}

function appendToScope(
  scope: NotificationIndexScope,
  key: string,
  notification: BuddyNotification,
) {
  const all = scope.all[key] ?? []
  scope.all[key] = [...all, notification]

  if (notification.viewed) return

  const unseen = scope.unseen[key] ?? []
  scope.unseen[key] = [...unseen, notification]
  scope.unseenCount[key] = unseen.length + 1
  if (notification.type === "error") {
    scope.unseenHasError[key] = true
  }
}

function buildNotificationIndex(list: BuddyNotification[]) {
  const index = createNotificationIndex()

  for (const notification of list) {
    if (notification.session) {
      appendToScope(index.session, notification.session, notification)
    }
    if (notification.directory) {
      appendToScope(index.project, notification.directory, notification)
    }
  }

  return index
}

function markListSessionViewed(list: BuddyNotification[], session: string) {
  return list.map((notification) =>
    notification.session === session && !notification.viewed
      ? { ...notification, viewed: true }
      : notification,
  )
}

function markListProjectViewed(list: BuddyNotification[], directory: string) {
  return list.map((notification) =>
    notification.directory === directory && !notification.viewed
      ? { ...notification, viewed: true }
      : notification,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNotificationType(value: unknown): value is BuddyNotification["type"] {
  return value === "turn-complete" || value === "error"
}

function readPersistedNotification(value: unknown): BuddyNotification | undefined {
  if (!isRecord(value)) return undefined
  if (!isNotificationType(value.type)) return undefined
  if (typeof value.time !== "number" || !Number.isFinite(value.time)) return undefined

  const base = {
    directory: typeof value.directory === "string" ? value.directory : undefined,
    session: typeof value.session === "string" ? value.session : undefined,
    time: value.time,
    viewed: typeof value.viewed === "boolean" ? value.viewed : false,
  }

  if (value.type === "turn-complete") {
    return {
      ...base,
      type: "turn-complete",
    }
  }

  return {
    ...base,
    type: "error",
    error: value.error,
  }
}

function readPersistedList(value: unknown) {
  if (!isRecord(value)) return []
  if (!Array.isArray(value.list)) return []
  return pruneNotifications(value.list.flatMap((item) => readPersistedNotification(item) ?? []))
}

export const useNotifications = create<NotificationsStore>()(
  persist(
    immer((set, get) => ({
      list: [],
      index: createNotificationIndex(),
      append(notification) {
        set((state) => {
          state.list = pruneNotifications([...state.list, notification])
          state.index = buildNotificationIndex(state.list)
        })
      },
      markSessionViewed(session) {
        set((state) => {
          state.list = markListSessionViewed(state.list, session)
          state.index = buildNotificationIndex(state.list)
        })
      },
      markProjectViewed(directory) {
        set((state) => {
          state.list = markListProjectViewed(state.list, directory)
          state.index = buildNotificationIndex(state.list)
        })
      },
      sessionUnseenCount(session) {
        return get().index.session.unseenCount[session] ?? 0
      },
      sessionUnseenHasError(session) {
        return get().index.session.unseenHasError[session] ?? false
      },
      projectUnseenCount(directory) {
        return get().index.project.unseenCount[directory] ?? 0
      },
      projectUnseenHasError(directory) {
        return get().index.project.unseenHasError[directory] ?? false
      },
    })),
    {
      name: NOTIFICATIONS_STORAGE_KEY,
      storage: createPlatformJsonStorage(NOTIFICATIONS_STORAGE_FILE),
      partialize: (state) => ({
        list: state.list,
      }),
      merge: (persisted, current) => {
        const list = readPersistedList(persisted)
        return {
          ...current,
          list,
          index: buildNotificationIndex(list),
        }
      },
    },
  ),
)
