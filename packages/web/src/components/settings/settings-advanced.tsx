import { useCallback, useEffect, useState } from "react"
import { Badge, Card, CardContent, Switch, toast } from "@buddy/ui"
import { language } from "@/context/language"
import { loadSkillsCatalog, updateSkillsSettings, type SkillsCatalog } from "@/state/skills-actions"
import { SettingsContent } from "./settings-primitives"

type AdvancedSettingsProps = {
  directory?: string
}

export function AdvancedSettings(props: AdvancedSettingsProps) {
  const [catalog, setCatalog] = useState<SkillsCatalog | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)

  const currentDirectory = props.directory

  const refreshCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const nextCatalog = await loadSkillsCatalog(currentDirectory)
      setCatalog(nextCatalog)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : language.t("settings.advanced.loadSettingsFailed")
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [currentDirectory])

  useEffect(() => {
    void refreshCatalog()
  }, [refreshCatalog])

  function setExternalVendorRootsEnabled(enabled: boolean) {
    setCatalog((current) => {
      if (!current) return current
      return {
        ...current,
        externalVendorRootsEnabled: enabled,
      }
    })
  }

  function toggleExternalVendorRoots(enabled: boolean) {
    if (!catalog) {
      return
    }
    if (catalog.externalVendorRootsEnabled === enabled) {
      return
    }

    void (async () => {
      const key = "settings:external-roots"
      const previous = catalog.externalVendorRootsEnabled
      setBusyKey(key)
      setExternalVendorRootsEnabled(enabled)

      try {
        await updateSkillsSettings(enabled, currentDirectory)
        const nextCatalog = await loadSkillsCatalog(currentDirectory, {
          refresh: true,
        })
        setCatalog(nextCatalog)
        toast.success(
          enabled
            ? language.t("settings.advanced.externalRootsEnabled")
            : language.t("settings.advanced.externalRootsDisabled"),
        )
      } catch (error) {
        setExternalVendorRootsEnabled(previous)
        const message =
          error instanceof Error ? error.message : language.t("settings.advanced.requestFailed")
        toast.error(message)
      } finally {
        setBusyKey(undefined)
      }
    })()
  }

  return (
    <SettingsContent
      title={language.t("settings.advanced.title")}
      description={language.t("settings.advanced.description")}
    >
      <Card className="border-border-base/60 bg-surface-raised-base/60">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-text-base">
                {language.t("settings.advanced.discoverExternalSkills")}
              </p>
              <Badge variant="outline" className="h-5">
                {catalog?.externalVendorRootsEnabled
                  ? language.t("settings.advanced.enabled")
                  : language.t("settings.advanced.disabled")}
              </Badge>
            </div>
            <p className="text-xs text-text-weak">
              {language.t("settings.advanced.externalSkillsDescription")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-weak">
              {catalog?.externalVendorRootsEnabled
                ? language.t("settings.advanced.on")
                : language.t("settings.advanced.off")}
            </span>
            <Switch
              checked={catalog?.externalVendorRootsEnabled ?? false}
              onCheckedChange={toggleExternalVendorRoots}
              disabled={loading || busyKey === "settings:external-roots"}
              aria-label={language.t("settings.advanced.discoverExternalRootsAria")}
            />
          </div>
        </CardContent>
      </Card>
    </SettingsContent>
  )
}
