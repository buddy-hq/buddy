import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"

type NotificationPreferences = {
  agent: boolean
  permissions: boolean
  errors: boolean
}

type NotificationPreferencesStore = {
  preferences: NotificationPreferences
  setAgent: (agent: boolean) => void
  setPermissions: (permissions: boolean) => void
  setErrors: (errors: boolean) => void
}

const NOTIFICATION_PREFERENCES_STORAGE_FILE = "buddy.notifications.dat"
const NOTIFICATION_PREFERENCES_STORAGE_KEY = "buddy.notifications.v1"

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  agent: true,
  permissions: true,
  errors: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

export const useNotificationPreferences = create<NotificationPreferencesStore>()(
  persist(
    (set) => ({
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      setAgent(agent) {
        set((state) => ({
          preferences: {
            ...state.preferences,
            agent,
          },
        }))
      },
      setPermissions(permissions) {
        set((state) => ({
          preferences: {
            ...state.preferences,
            permissions,
          },
        }))
      },
      setErrors(errors) {
        set((state) => ({
          preferences: {
            ...state.preferences,
            errors,
          },
        }))
      },
    }),
    {
      name: NOTIFICATION_PREFERENCES_STORAGE_KEY,
      storage: createPlatformJsonStorage(NOTIFICATION_PREFERENCES_STORAGE_FILE),
      partialize: (state) => ({
        preferences: state.preferences,
      }),
      merge: (persisted, current) => {
        if (!isRecord(persisted)) {
          return current
        }

        const preferences = isRecord(persisted.preferences) ? persisted.preferences : undefined

        return {
          ...current,
          preferences: {
            agent: readBoolean(preferences?.agent, current.preferences.agent),
            permissions: readBoolean(preferences?.permissions, current.preferences.permissions),
            errors: readBoolean(preferences?.errors, current.preferences.errors),
          },
        }
      },
    },
  ),
)
