import type { UpdateAction, UpdateFailure, UpdateState } from "@buddy/update-contract"
import { language } from "@/context/language"

export function describeUpdateStatus(state: UpdateState): string {
  const { activity } = state
  switch (activity.status) {
    case "unsupported":
      return language.t("settings.updates.unavailable")
    case "idle":
      return language.t("updates.status.idle")
    case "checking":
      return language.t("updates.status.checking")
    case "up-to-date":
      return language.t("updates.status.upToDate")
    case "blocked":
      return language.t("updates.status.blocked")
    case "available":
      return language.t("updates.status.available", { version: activity.version })
    case "downloading": {
      const percent = updateDownloadPercent(state)
      return percent === undefined
        ? language.t("updates.status.downloading", { version: activity.version })
        : language.t("updates.status.downloadingPercent", {
            version: activity.version,
            percent: Math.floor(percent),
          })
    }
    case "downloaded":
      return language.t("updates.status.downloaded", { version: activity.version })
    case "installing":
      return language.t("updates.status.installing", { version: activity.version })
  }
}

export function describeUpdateFailure(failure: UpdateFailure): string {
  switch (failure.stage) {
    case "check":
      return language.t("updates.failure.check")
    case "download":
      return language.t("updates.failure.download")
    case "install":
      return language.t("updates.failure.install")
  }
}

function isRetryAction(action: UpdateAction, failure: UpdateFailure | undefined): boolean {
  return (
    (action === "check" && failure?.stage === "check") ||
    (action === "download" && failure?.stage === "download") ||
    (action === "install" && failure?.stage === "install")
  )
}

export function describeUpdateAction(
  action: UpdateAction,
  failure: UpdateFailure | undefined,
): string | undefined {
  switch (action) {
    case "none":
      return undefined
    case "check":
      return isRetryAction(action, failure)
        ? language.t("updates.action.retry")
        : language.t("updates.action.check")
    case "download":
      return isRetryAction(action, failure)
        ? language.t("updates.action.retry")
        : language.t("updates.action.download")
    case "install":
      return isRetryAction(action, failure)
        ? language.t("updates.action.retry")
        : language.t("updates.action.install")
  }
}

export function describeUpdateHint(
  action: UpdateAction,
  failure: UpdateFailure | undefined,
): string | undefined {
  if (action === "none") return undefined
  if (isRetryAction(action, failure)) return language.t("updates.hint.retry")
  switch (action) {
    case "check":
      return undefined
    case "download":
      return language.t("updates.hint.download")
    case "install":
      return language.t("updates.hint.install")
  }
}

export function describeUpdateTooltip(state: UpdateState, action: UpdateAction): string {
  const lead = state.failure ? describeUpdateFailure(state.failure) : describeUpdateStatus(state)
  const hint = describeUpdateHint(action, state.failure)
  return hint ? `${lead} · ${hint}` : lead
}

export function showsUpdateChangelog(state: UpdateState, action: UpdateAction): boolean {
  return action === "download" && !state.failure && state.releaseNotes.length > 0
}

export function updateDownloadPercent(state: UpdateState): number | undefined {
  return state.activity.status === "downloading" ? state.activity.progress.percent : undefined
}
