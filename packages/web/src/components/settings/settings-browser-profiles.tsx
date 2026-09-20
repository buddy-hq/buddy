import { useMemo, useState } from "react"
import { toast } from "@buddy/ui"
import type { BrowserImportSource } from "@buddy/browser-contract/browser-import"
import {
  createInAppBrowserProfileID,
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  IN_APP_BROWSER_PROFILE_MAX_COUNT,
  isBuiltInInAppBrowserProfileID,
  resolveInAppBrowserProfiles,
  type InAppBrowserProfile,
} from "@buddy/browser-contract/profiles"
import type { InAppBrowserPlatform } from "@/context/platform"
import { uniqueInAppBrowserProfileName } from "@/lib/in-app-browser-settings"
import {
  flushInAppBrowserSettings,
  useInAppBrowserSettingsHydrated,
  useInAppBrowserSettingsStore,
} from "@/state/in-app-browser-settings-store"
import { BrowserAddProfileMenu } from "./browser-add-profile-menu"
import { BrowserImportWizard } from "./browser-import-wizard"
import { BrowserProfileRow } from "./browser-profile-row"
import { RemoveBrowserProfileDialog } from "./remove-browser-profile-dialog"
import { SettingsListCard, SettingsSectionHeader } from "./settings-primitives"
import { useBrowserProfileImport } from "./use-browser-profile-import"

const NEW_PROFILE_NAME = "New profile"

async function createBlankProfile() {
  const settings = useInAppBrowserSettingsStore.getState()
  const result = settings.addProfile({
    id: createInAppBrowserProfileID(),
    name: uniqueInAppBrowserProfileName(NEW_PROFILE_NAME, settings.userProfiles),
  })
  if (result["_tag"] !== "added" || (await flushInAppBrowserSettings())) return
  useInAppBrowserSettingsStore.getState().removeProfile(result.profile.id)
  await flushInAppBrowserSettings()
  toast.error("Could not save the new browser profile")
}

async function renameProfile(profile: InAppBrowserProfile, name: string) {
  useInAppBrowserSettingsStore.getState().renameProfile({ id: profile.id, name })
  if (await flushInAppBrowserSettings()) return
  const currentProfile = useInAppBrowserSettingsStore
    .getState()
    .userProfiles.find((candidate) => candidate.id === profile.id)
  if (currentProfile?.name === name) {
    useInAppBrowserSettingsStore.getState().renameProfile({ id: profile.id, name: profile.name })
    await flushInAppBrowserSettings()
  }
  toast.error(`Could not rename ${profile.name}`)
}

async function setDefaultProfile(profile: InAppBrowserProfile) {
  const previousDefaultProfileID = useInAppBrowserSettingsStore.getState().defaultProfileID
  useInAppBrowserSettingsStore.getState().setDefaultProfileID(profile.id)
  if (await flushInAppBrowserSettings()) return
  if (useInAppBrowserSettingsStore.getState().defaultProfileID === profile.id) {
    useInAppBrowserSettingsStore.getState().setDefaultProfileID(previousDefaultProfileID)
    await flushInAppBrowserSettings()
  }
  toast.error(`Could not make ${profile.name} the default`)
}

export function BrowserProfilesSection(props: { browser: InAppBrowserPlatform }) {
  const { browser } = props
  const userProfiles = useInAppBrowserSettingsStore((state) => state.userProfiles)
  const defaultProfileID = useInAppBrowserSettingsStore((state) => state.defaultProfileID)
  const settingsHydrated = useInAppBrowserSettingsHydrated()
  const profileImport = useBrowserProfileImport(browser)
  const [importSource, setImportSource] = useState<BrowserImportSource | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<InAppBrowserProfile | null>(null)
  const [removalError, setRemovalError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const listedProfiles = useMemo(
    () =>
      resolveInAppBrowserProfiles(userProfiles).filter(
        (profile) => profile.id !== INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
      ),
    [userProfiles],
  )
  const atProfileLimit = userProfiles.length >= IN_APP_BROWSER_PROFILE_MAX_COUNT

  function clearProfileData(profile: InAppBrowserProfile) {
    const failed = () => toast.error(`Could not clear ${profile.name}'s data`)
    void browser.clearProfileData({ profileID: profile.id, data: "everything" }).then((result) => {
      if (result["_tag"] === "done") toast.success(`Cleared ${profile.name}'s cookies and cache`)
      else failed()
    }, failed)
  }

  async function removeProfile(profile: InAppBrowserProfile) {
    setRemovalError(null)
    setRemoving(true)
    const result = await browser
      .clearProfileData({ profileID: profile.id, data: "everything" })
      .catch(() => undefined)
    setRemoving(false)
    if (result?.["_tag"] !== "done") {
      setRemovalError("Profile data could not be deleted. Try again.")
      return
    }
    const settings = useInAppBrowserSettingsStore.getState()
    const wasDefault = settings.defaultProfileID === profile.id
    settings.removeProfile(profile.id)
    if (!(await flushInAppBrowserSettings())) {
      const restored = useInAppBrowserSettingsStore.getState().addProfile(profile)
      if (restored["_tag"] === "added" && wasDefault) {
        useInAppBrowserSettingsStore.getState().setDefaultProfileID(profile.id)
      }
      await flushInAppBrowserSettings()
      setRemovalError("The profile was cleared, but removing it could not be saved. Try again.")
      return
    }
    setPendingRemoval(null)
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <SettingsSectionHeader
          title="Profiles"
          description="Profiles separate cookies and logins. Incognito data is cleared when Buddy closes."
        />
        <BrowserAddProfileMenu
          disabled={!settingsHydrated || profileImport.importing}
          atProfileLimit={atProfileLimit}
          sources={profileImport.sources}
          onOpen={profileImport.loadSources}
          onCreateBlank={createBlankProfile}
          onImport={setImportSource}
        />
      </div>
      <SettingsListCard>
        {listedProfiles.map((profile) => (
          <BrowserProfileRow
            key={profile.id}
            profile={profile}
            isDefault={profile.id === defaultProfileID}
            disabled={!settingsHydrated || profileImport.importing}
            onRename={
              isBuiltInInAppBrowserProfileID(profile.id)
                ? undefined
                : (name) => void renameProfile(profile, name)
            }
            onSetDefault={() => void setDefaultProfile(profile)}
            onClearData={() => clearProfileData(profile)}
            onRemove={
              isBuiltInInAppBrowserProfileID(profile.id)
                ? undefined
                : () => {
                    setRemovalError(null)
                    setPendingRemoval(profile)
                  }
            }
          />
        ))}
      </SettingsListCard>
      <RemoveBrowserProfileDialog
        profile={pendingRemoval}
        removing={removing}
        error={removalError}
        onCancel={() => {
          setPendingRemoval(null)
          setRemovalError(null)
        }}
        onRemove={(profile) => void removeProfile(profile)}
      />
      {importSource ? (
        <BrowserImportWizard
          source={importSource}
          targetProfiles={listedProfiles}
          canCreateProfile={!atProfileLimit}
          onImport={(input) => profileImport.runImport(importSource, input)}
          onRefreshSource={() => profileImport.refreshSource(importSource.id)}
          onOpenFullDiskAccessSettings={browser.openFullDiskAccessSettings}
          onCheckFullDiskAccess={browser.checkSafariFullDiskAccess}
          onClose={() => setImportSource(null)}
        />
      ) : null}
    </div>
  )
}
