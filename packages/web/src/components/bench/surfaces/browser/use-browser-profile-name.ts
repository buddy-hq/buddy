import {
  resolveInAppBrowserProfiles,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { useInAppBrowserSettingsStore } from "@/state/in-app-browser-settings-store"

const REMOVED_PROFILE_NAME = "Removed profile"

export function useBrowserProfileName(profileID: InAppBrowserProfileID): string {
  const userProfiles = useInAppBrowserSettingsStore((state) => state.userProfiles)
  return (
    resolveInAppBrowserProfiles(userProfiles).find((profile) => profile.id === profileID)?.name ??
    REMOVED_PROFILE_NAME
  )
}
