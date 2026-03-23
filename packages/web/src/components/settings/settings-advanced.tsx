import { useCallback, useEffect, useState } from "react"
import { Badge, Card, CardContent, Switch, toast } from "@buddy/ui"
import { loadSkillsCatalog, updateSkillsSettings, type SkillsCatalog } from "@/state/skills-actions"
import { SettingsPanelContent } from "./settings-page"

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
      const message = error instanceof Error ? error.message : "Failed to load settings"
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
            ? "External .agents/.claude skill discovery is enabled."
            : "External .agents/.claude skill discovery is disabled.",
        )
      } catch (error) {
        setExternalVendorRootsEnabled(previous)
        const message = error instanceof Error ? error.message : "Request failed"
        toast.error(message)
      } finally {
        setBusyKey(undefined)
      }
    })()
  }

  return (
    <SettingsPanelContent title="Advanced" description="Advanced settings for power users.">
      <Card className="border-border/60 bg-card/60">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                Discover external <code>.agents/.claude</code> skills (restore vendor behavior)
              </p>
              <Badge variant="outline" className="h-5">
                {catalog?.externalVendorRootsEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled for this notebook, Buddy discovers vendor-style skills from home and
              ancestor directories.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {catalog?.externalVendorRootsEnabled ? "On" : "Off"}
            </span>
            <Switch
              checked={catalog?.externalVendorRootsEnabled ?? false}
              onCheckedChange={toggleExternalVendorRoots}
              disabled={loading || busyKey === "settings:external-roots"}
              aria-label="Discover external vendor roots"
            />
          </div>
        </CardContent>
      </Card>
    </SettingsPanelContent>
  )
}
