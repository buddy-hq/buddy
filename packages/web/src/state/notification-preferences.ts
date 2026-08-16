import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"
import { parseBooleanValue, parseBuddyConfigObject } from "./parse-external"

type TNotificationPreferences = {
  agent: boolean
  permissions: boolean
  errors: boolean
}

type TNotificationPreferencesStore = {
  preferences: TNotificationPreferences
  setAgent: (agent: boolean) => void
  setPermissions: (permissions: boolean) => void
  setErrors: (errors: boolean) => void
}

const NOTIFICATION_PREFERENCES_STORAGE_FILE = "buddy.notifications.dat"
const NOTIFICATION_PREFERENCES_STORAGE_KEY = "buddy.notifications.v1"

export const DEFAULT_NOTIFICATION_PREFERENCES: TNotificationPreferences = {
  agent: true,
  permissions: true,
  errors: false,
}

function readBoolean<TValue>(value: TValue, fallback: boolean) {
  return parseBooleanValue(value) ?? fallback
}

export const useNotificationPreferences = create<TNotificationPreferencesStore>()(
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
        const record = parseBuddyConfigObject(persisted)
        if (!record) {
          return current
        }

        const preferences = parseBuddyConfigObject(record.preferences)

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
