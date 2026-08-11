import { useCallback, useEffect, useState } from "react"
import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import {
  usePlatform,
  type UpdateCheckResult,
  type UpdateProgressSnapshot,
  type UpdateRing,
} from "@/context/platform"

const DEFAULT_UPDATE_RING: UpdateRing = "stable"

export const UPDATE_RINGS: readonly UpdateRing[] = ["stable", "preview"]

export type UpdateBannerTone = "neutral" | "positive" | "critical"

export type UpdateBannerAction = "install" | "retry"

/**
 * The one thing the panel has to say right now, or nothing at all.
 *
 * Everything here is derived from what the updater already reports. There is no
 * "last checked at" and no release notes, so the banner never claims either.
 */
export type UpdateBanner = {
  tone: UpdateBannerTone
  title: string
  detail?: string
  busy: boolean
  percent?: number
  action?: UpdateBannerAction
}

export type UpdateBannerInput = {
  progress: UpdateProgressSnapshot
  lastCheck?: UpdateCheckResult
  checking: boolean
  installFailed: boolean
}

export function isUpdateRing(value: string): value is UpdateRing {
  return UPDATE_RINGS.some((ring) => ring === value)
}

function idleProgress(ring: UpdateRing): UpdateProgressSnapshot {
  return { ring, status: "idle" }
}

function isBusyStatus(progress: UpdateProgressSnapshot): boolean {
  return (
    progress.status === "checking" ||
    progress.status === "downloading" ||
    progress.status === "installing"
  )
}

function clampPercent(percent: number | undefined): number | undefined {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return undefined
  }

  return Math.min(100, Math.max(0, percent))
}

function downloadDetail(progress: UpdateProgressSnapshot): string {
  const percent = clampPercent(progress.percent)
  if (percent === undefined) {
    return language.t("settings.updates.progressPreparing")
  }

  return language.t("settings.updates.progressPercent", { percent: String(Math.round(percent)) })
}

function versionedTitle(withVersion: string, withoutVersion: string, version?: string): string {
  return version ? language.t(withVersion, { version }) : language.t(withoutVersion)
}

function failureTitle(stage: "check" | "download" | "install" | undefined): string {
  switch (stage) {
    case "install":
      return language.t("settings.updates.installFailed")
    case "download":
      return language.t("settings.updates.updateDownloadFailed")
    case "check":
    case undefined:
      return language.t("settings.updates.updateCheckFailed")
  }
}

function checkResultBanner(result: UpdateCheckResult | undefined): UpdateBanner | undefined {
  if (!result) return undefined

  switch (result.status) {
    case "up-to-date":
      return { tone: "positive", title: language.t("settings.updates.upToDate"), busy: false }
    case "disabled":
      return { tone: "neutral", title: language.t("settings.updates.unavailable"), busy: false }
    case "blocked":
      return { tone: "neutral", title: language.t("settings.updates.updateBlocked"), busy: false }
    case "error":
      return {
        tone: "critical",
        title: failureTitle(result.stage),
        detail: language.t("settings.updates.bannerErrorDetail"),
        busy: false,
        action: "retry",
      }
    case "ready":
      // The progress snapshot owns this one — it carries the version.
      return undefined
  }
}

export function resolveUpdateBanner(input: UpdateBannerInput): UpdateBanner | undefined {
  if (input.installFailed) {
    return {
      tone: "critical",
      title: language.t("settings.updates.installFailed"),
      detail: language.t("settings.updates.bannerErrorDetail"),
      busy: false,
      action: "install",
    }
  }

  switch (input.progress.status) {
    case "installing":
      return { tone: "neutral", title: language.t("settings.updates.bannerInstalling"), busy: true }
    case "downloading":
      return {
        tone: "neutral",
        title: versionedTitle(
          "settings.updates.bannerDownloadingWithVersion",
          "settings.updates.bannerDownloading",
          input.progress.version,
        ),
        detail: downloadDetail(input.progress),
        busy: true,
        percent: clampPercent(input.progress.percent),
      }
    case "checking":
      return { tone: "neutral", title: language.t("settings.updates.bannerChecking"), busy: true }
    case "ready":
      return {
        tone: "positive",
        title: versionedTitle(
          "settings.updates.bannerReadyWithVersion",
          "settings.updates.bannerReady",
          input.progress.version,
        ),
        detail: language.t("settings.updates.bannerReadyDetail"),
        busy: false,
        action: "install",
      }
    case "error":
      return {
        tone: "critical",
        title: failureTitle(input.progress.errorStage),
        detail: language.t("settings.updates.bannerErrorDetail"),
        busy: false,
        action: "retry",
      }
    case "idle":
      break
  }

  if (input.checking) {
    return { tone: "neutral", title: language.t("settings.updates.bannerChecking"), busy: true }
  }

  return checkResultBanner(input.lastCheck)
}

export type UpdateSettings = {
  /** False on web, and on desktop builds without the updater wired up. */
  supported: boolean
  ring: UpdateRing
  version?: string
  banner?: UpdateBanner
  busy: boolean
  checkForUpdates: () => Promise<void>
  changeRing: (ring: UpdateRing) => Promise<void>
  installUpdate: () => Promise<void>
}

export function useUpdateSettings(): UpdateSettings {
  const platform = usePlatform()
  const [ring, setRing] = useState<UpdateRing>(DEFAULT_UPDATE_RING)
  const [progress, setProgress] = useState<UpdateProgressSnapshot>(
    idleProgress(DEFAULT_UPDATE_RING),
  )
  const [lastCheck, setLastCheck] = useState<UpdateCheckResult | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const [savingRing, setSavingRing] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installFailed, setInstallFailed] = useState(false)

  const supported =
    platform.platform === "desktop" &&
    !!platform.checkUpdate &&
    !!platform.update &&
    !!platform.restart &&
    !!platform.getUpdateRing &&
    !!platform.setUpdateRing &&
    !!platform.getUpdateProgress &&
    !!platform.onUpdateProgress

  useEffect(() => {
    if (!supported) return

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
  }, [platform, supported])

  const checkForUpdates = useCallback(async () => {
    if (!supported || !platform.checkUpdate) return

    setLastCheck(undefined)
    setInstallFailed(false)
    setChecking(true)
    const result = await platform
      .checkUpdate()
      .catch<UpdateCheckResult>(() => ({ stage: "check", status: "error" }))
    setChecking(false)
    setLastCheck(result)
  }, [platform, supported])

  const changeRing = useCallback(
    async (nextRing: UpdateRing) => {
      if (!supported || nextRing === ring) return

      const previousRing = ring
      setRing(nextRing)
      setSavingRing(true)
      setLastCheck(undefined)
      setInstallFailed(false)
      try {
        await platform.setUpdateRing?.(nextRing)
        setProgress((current) => (current.status === "idle" ? idleProgress(nextRing) : current))
        if (nextRing === "preview") {
          await checkForUpdates()
        }
      } catch {
        setRing(previousRing)
        toast.error(language.t("settings.updates.ringSaveFailed"))
      } finally {
        setSavingRing(false)
      }
    },
    [checkForUpdates, platform, ring, supported],
  )

  const installUpdate = useCallback(async () => {
    if (!supported || !platform.update) return

    setInstalling(true)
    setInstallFailed(false)
    try {
      await platform.update()
    } catch {
      setInstallFailed(true)
    } finally {
      setInstalling(false)
    }
  }, [platform, supported])

  return {
    supported,
    ring,
    version: platform.version,
    banner: resolveUpdateBanner({ progress, lastCheck, checking, installFailed }),
    busy: checking || savingRing || installing || isBusyStatus(progress),
    checkForUpdates,
    changeRing,
    installUpdate,
  }
}
