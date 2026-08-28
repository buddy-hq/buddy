import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import {
  SKILLS_CATALOG_LAYOUT_TWO_COLUMNS,
  SkillsCatalogSurface,
} from "@/components/directory-chat/right-workspace-skills-drawer"
import { invalidateAllSkillsCatalogQueries } from "@/state/skills-catalog-query"
import { updateSkillsSettings } from "@/state/skills-actions"
import { globalConfigQueryKeys, globalConfigQueryOptions } from "@/state/global-config-query"
import type { TBuddyConfigObject } from "@/state/parse-external"
import {
  SettingsContent,
  SettingsRow,
  SettingsSection,
  SettingsSwitchControl,
} from "./settings-primitives"

const GLOBAL_SKILLS_DIRECTORY = ""
const SKILLS_EXTERNAL_VENDOR_ROOTS_ENABLED_CONFIG_KEY = "skills_external_vendor_roots_enabled"

export function SkillsSettings() {
  const queryClient = useQueryClient()
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const fallbackDirectory = useChatStore((state) => state.openProjects[0])
  const directory = activeDirectory ?? fallbackDirectory ?? GLOBAL_SKILLS_DIRECTORY
  const [savingExternalRoots, setSavingExternalRoots] = useState(false)
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const externalVendorRootsEnabled =
    globalConfigQuery.data?.[SKILLS_EXTERNAL_VENDOR_ROOTS_ENABLED_CONFIG_KEY] === true
  const skillsSettingsLoading = globalConfigQuery.isPending || globalConfigQuery.isFetching

  function setExternalVendorRootsEnabled(enabled: boolean) {
    queryClient.setQueryData<TBuddyConfigObject | undefined>(
      globalConfigQueryKeys.bundle(),
      (current) =>
        current
          ? {
              ...current,
              [SKILLS_EXTERNAL_VENDOR_ROOTS_ENABLED_CONFIG_KEY]: enabled,
            }
          : current,
    )
  }

  function toggleExternalVendorRoots(enabled: boolean) {
    if (externalVendorRootsEnabled === enabled) {
      return
    }

    void (async () => {
      const previous = externalVendorRootsEnabled
      setSavingExternalRoots(true)
      setExternalVendorRootsEnabled(enabled)

      try {
        const result = await updateSkillsSettings(enabled)
        setExternalVendorRootsEnabled(result.externalVendorRootsEnabled)
        await invalidateAllSkillsCatalogQueries(queryClient)
        toast.success(
          result.externalVendorRootsEnabled
            ? language.t("settings.advanced.externalRootsEnabled")
            : language.t("settings.advanced.externalRootsDisabled"),
        )
      } catch (error) {
        setExternalVendorRootsEnabled(previous)
        const message =
          error instanceof Error ? error.message : language.t("settings.advanced.requestFailed")
        toast.error(message)
      } finally {
        setSavingExternalRoots(false)
      }
    })()
  }

  return (
    <SettingsContent>
      <SettingsSection title={language.t("settings.skills.discoverySection")}>
        <SettingsRow
          title={language.t("settings.advanced.discoverExternalSkills")}
          description={language.t("settings.advanced.externalSkillsDescription")}
          control={
            <SettingsSwitchControl
              dataAction="settings-external-skill-roots"
              checked={externalVendorRootsEnabled}
              onCheckedChange={toggleExternalVendorRoots}
              disabled={skillsSettingsLoading || savingExternalRoots}
              ariaLabel={language.t("settings.advanced.discoverExternalRootsAria")}
              onLabel={language.t("settings.advanced.on")}
              offLabel={language.t("settings.advanced.off")}
            />
          }
        />
      </SettingsSection>

      <div data-component="settings-skills" className="w-full min-w-0">
        <SkillsCatalogSurface directory={directory} layout={SKILLS_CATALOG_LAYOUT_TWO_COLUMNS} />
      </div>
    </SettingsContent>
  )
}
