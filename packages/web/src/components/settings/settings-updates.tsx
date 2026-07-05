import { useEffect, useState } from "react"
import { Button, Progress, Spinner, ToggleGroup, ToggleGroupItem, toast } from "@buddy/ui"
import { language } from "@/context/language"
import {
  usePlatform,
  type UpdateCheckResult,
  type UpdateProgressSnapshot,
  type UpdateRing,
} from "@/context/platform"
import { showDesktopUpdateProgressToast, showDesktopUpdateToast } from "@/lib/desktop-updates"
import { SettingsContent, SettingsRow, SettingsSection } from "./settings-primitives"

const DEFAULT_UPDATE_RING: UpdateRing = "stable"

function isUpdateRing(value: string): value is UpdateRing {
  return value === "stable" || value === "preview"
}

function idleProgress(ring: UpdateRing): UpdateProgressSnapshot {
  return {
    ring,
    status: "idle",
  }
}

function isBusy(progress: UpdateProgressSnapshot): boolean {
  return (
    progress.status === "checking" ||
    progress.status === "downloading" ||
    progress.status === "installing"
  )
}

function progressPercent(progress: UpdateProgressSnapshot): number | undefined {
  if (typeof progress.percent !== "number" || !Number.isFinite(progress.percent)) {
    return undefined
  }

  return Math.min(100, Math.max(0, progress.percent))
}

function formatProgress(progress: UpdateProgressSnapshot): string {
  const percent = progressPercent(progress)
  if (percent !== undefined) {
    return language.t("settings.updates.progressPercent", {
      percent: String(Math.round(percent)),
    })
  }

  return language.t("settings.updates.progressPreparing")
}

function updateCheckFallback(): UpdateCheckResult {
  return {
    stage: "check",
    status: "error",
  }
}

function statusLabel(progress: UpdateProgressSnapshot): string {
  switch (progress.status) {
    case "checking":
      return language.t("settings.updates.statusChecking")
    case "downloading":
      return language.t("settings.updates.statusDownloading")
    case "ready":
      return progress.version
        ? language.t("settings.updates.statusReadyWithVersion", { version: progress.version })
        : language.t("settings.updates.statusReady")
    case "installing":
      return language.t("settings.updates.statusInstalling")
    case "error":
      return language.t("settings.updates.statusError")
    case "idle":
      return language.t("settings.updates.statusIdle")
  }
}

export function UpdatesSettings() {
  const platform = usePlatform()
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)
  const [savingRing, setSavingRing] = useState(false)
  const [ring, setRing] = useState<UpdateRing>(DEFAULT_UPDATE_RING)
  const [progress, setProgress] = useState<UpdateProgressSnapshot>(
    idleProgress(DEFAULT_UPDATE_RING),
  )

  const showDesktopUpdateControls =
    platform.platform === "desktop" &&
    !!platform.checkUpdate &&
    !!platform.update &&
    !!platform.restart &&
    !!platform.getUpdateRing &&
    !!platform.setUpdateRing &&
    !!platform.getUpdateProgress &&
    !!platform.onUpdateProgress

  const busy = checkingForUpdates || savingRing || isBusy(progress)

  useEffect(() => {
    if (!showDesktopUpdateControls) return

    let cancelled = false
    void platform.getUpdateRing?.().then((nextRing) => {
      if (cancelled) return
      setRing(nextRing)
    })
    void platform.getUpdateProgress?.().then((snapshot) => {
      if (cancelled) return
      setProgress(snapshot)
    })

    const unsubscribe = platform.onUpdateProgress?.((snapshot) => {
      setProgress(snapshot)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [platform, showDesktopUpdateControls])

  useEffect(() => {
    if (!showDesktopUpdateControls) return
    showDesktopUpdateProgressToast({
      progress,
      showChecking: checkingForUpdates,
    })
  }, [checkingForUpdates, progress, showDesktopUpdateControls])

  async function onCheckForUpdates() {
    if (!showDesktopUpdateControls || !platform.checkUpdate) {
      return
    }

    setCheckingForUpdates(true)
    const result = await platform.checkUpdate().catch(() => updateCheckFallback())
    setCheckingForUpdates(false)

    switch (result.status) {
      case "ready":
        showDesktopUpdateToast({ platform, version: result.version })
        return
      case "up-to-date":
        toast(language.t("settings.updates.upToDate"))
        return
      case "disabled":
        toast(language.t("settings.updates.unavailable"))
        return
      case "blocked":
        toast(language.t("settings.updates.updateBlocked"))
        return
      case "error":
        toast.error(
          result.stage === "download"
            ? language.t("settings.updates.updateDownloadFailed")
            : language.t("settings.updates.updateCheckFailed"),
        )
    }
  }

  async function onUpdateRingChange(value: string) {
    if (!isUpdateRing(value) || value === ring || !showDesktopUpdateControls) {
      return
    }

    const previousRing = ring
    setRing(value)
    setSavingRing(true)
    try {
      await platform.setUpdateRing?.(value)
      setProgress((current) => (current.status === "idle" ? idleProgress(value) : current))
      if (value === "preview") {
        await onCheckForUpdates()
      }
    } catch {
      setRing(previousRing)
      toast.error(language.t("settings.updates.ringSaveFailed"))
    } finally {
      setSavingRing(false)
    }
  }

  return (
    <SettingsContent>
      <SettingsSection title={language.t("settings.updates.title")}>
        <SettingsRow
          title={language.t("settings.updates.channelTitle")}
          description={language.t("settings.updates.channelDescription")}
          control={
            <ToggleGroup
              data-action="settings-update-ring"
              type="single"
              value={ring}
              variant="outline"
              size="sm"
              onValueChange={(value) => void onUpdateRingChange(value)}
              disabled={!showDesktopUpdateControls || busy}
            >
              <ToggleGroupItem value="stable">
                {language.t("settings.updates.ringStable")}
              </ToggleGroupItem>
              <ToggleGroupItem value="preview">
                {language.t("settings.updates.ringPreview")}
              </ToggleGroupItem>
            </ToggleGroup>
          }
        />
        <SettingsRow
          title={language.t("settings.updates.checkTitle")}
          description={
            showDesktopUpdateControls
              ? language.t("settings.updates.checkDescription")
              : language.t("settings.updates.unavailable")
          }
          control={
            <Button
              data-action="settings-check-updates"
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void onCheckForUpdates()}
              disabled={!showDesktopUpdateControls || busy}
            >
              {checkingForUpdates ? <Spinner data-icon="inline-start" /> : null}
              {checkingForUpdates
                ? language.t("settings.updates.checking")
                : language.t("settings.updates.checkForUpdates")}
            </Button>
          }
        />
        <SettingsRow
          title={language.t("settings.updates.statusTitle")}
          description={language.t("settings.updates.statusDescription")}
          control={
            <div className="flex w-60 flex-col items-end gap-2 text-right">
              <span className="text-xs text-text-weak">{statusLabel(progress)}</span>
              {progress.status === "downloading" ? (
                <div className="flex w-full flex-col gap-1.5">
                  <Progress value={progressPercent(progress) ?? 0} />
                  <span className="text-[11px] text-text-weaker">{formatProgress(progress)}</span>
                </div>
              ) : null}
            </div>
          }
        />
      </SettingsSection>
    </SettingsContent>
  )
}
