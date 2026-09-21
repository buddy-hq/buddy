import type { UpdateAction, UpdateRing, UpdateState } from "@buddy/update-contract"
import { isUpdateBusy, isUpdateRing } from "@buddy/update-contract"
import {
  Button,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
} from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { formatRelativeTime } from "@/state/openai-usage-format"
import { ConfirmUpdateInstallDialog } from "@/components/updates/confirm-update-install-dialog"
import { UpdateReleaseNotes } from "@/components/updates/update-release-notes"
import {
  describeUpdateAction,
  describeUpdateFailure,
  describeUpdateStatus,
  updateDownloadPercent,
} from "@/components/updates/update-presentation"
import { useUpdateControl } from "@/components/updates/use-update-control"
import { SettingsRow, SettingsSection } from "./settings-primitives"

type BannerTone = "neutral" | "positive" | "critical"

type UpdateBanner = {
  tone: BannerTone
  title: string
  detail?: string
  busy: boolean
  percent?: number
  actionLabel?: string
}

const BANNER_SURFACE = {
  neutral: "bg-surface-weak text-text-base",
  positive: "bg-surface-success-weak text-text-on-success-weak",
  critical: "bg-surface-critical-weak text-text-on-critical-weak",
} satisfies Record<BannerTone, string>

const RING_LABEL_KEYS = {
  stable: "settings.updates.ringStable",
  preview: "settings.updates.ringPreview",
} satisfies Record<UpdateRing, string>

const RING_DESCRIPTION_KEYS = {
  stable: "settings.updates.channelStableDescription",
  preview: "settings.updates.channelPreviewDescription",
} satisfies Record<UpdateRing, string>

function resolveUpdateBanner(state: UpdateState, action: UpdateAction): UpdateBanner | undefined {
  const actionLabel = action === "check" ? undefined : describeUpdateAction(action, state.failure)

  if (state.failure) {
    return {
      tone: "critical",
      title: describeUpdateFailure(state.failure),
      detail: language.t("updates.failure.detail"),
      busy: false,
      actionLabel: describeUpdateAction(action, state.failure),
    }
  }

  switch (state.activity.status) {
    case "unsupported":
    case "idle":
      return undefined
    case "checking":
    case "installing":
      return { tone: "neutral", title: describeUpdateStatus(state), busy: true }
    case "downloading":
      return {
        tone: "neutral",
        title: describeUpdateStatus(state),
        busy: true,
        percent: updateDownloadPercent(state),
      }
    case "blocked":
      return { tone: "neutral", title: describeUpdateStatus(state), busy: false }
    case "up-to-date":
    case "available":
    case "downloaded":
      return { tone: "positive", title: describeUpdateStatus(state), busy: false, actionLabel }
  }
}

function UpdateBannerStrip(props: { banner: UpdateBanner; onAction: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-action="settings-update-banner"
      data-tone={props.banner.tone}
      className={cn("flex flex-col gap-2 px-4 py-3 sm:px-5", BANNER_SURFACE[props.banner.tone])}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {props.banner.busy ? (
            <Spinner className="size-3.5 shrink-0 animate-[spin_2s_linear_infinite] motion-reduce:animate-none" />
          ) : null}
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-[13px] font-medium tracking-[-0.01em]">
              {props.banner.title}
            </p>
            {props.banner.detail ? (
              <p className="truncate text-xs">{props.banner.detail}</p>
            ) : null}
          </div>
        </div>
        {props.banner.actionLabel ? (
          <Button
            data-action="settings-update-banner-action"
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0"
            onClick={props.onAction}
          >
            {props.banner.actionLabel}
          </Button>
        ) : null}
      </div>
      {props.banner.percent === undefined ? null : <Progress value={props.banner.percent} />}
    </div>
  )
}

export function UpdatesSettingsSection() {
  const platform = usePlatform()
  const { state, action, perform, check, setRing, confirmation } = useUpdateControl()
  const supported = state.activity.status !== "unsupported"
  const busy = isUpdateBusy(state)
  const banner = resolveUpdateBanner(state, action)
  const offersUpdate = action === "download" || action === "install"

  return (
    <SettingsSection title={language.t("settings.updates.title")}>
      {banner ? <UpdateBannerStrip banner={banner} onAction={perform} /> : null}

      {offersUpdate && state.releaseNotes.length > 0 ? (
        <div className="border-t border-border-base/60 px-4 py-3.5 sm:px-5">
          <UpdateReleaseNotes
            notes={state.releaseNotes}
            onOpenRelease={(url) => platform.openLink(url)}
          />
        </div>
      ) : null}

      <SettingsRow
        title={language.t("settings.updates.versionTitle")}
        control={
          <span className="text-xs text-text-weak tabular-nums">
            {state.currentVersion || language.t("settings.updates.versionUnknown")}
          </span>
        }
      />

      <SettingsRow
        title={language.t("settings.updates.channelTitle")}
        description={language.t(RING_DESCRIPTION_KEYS[state.ring])}
        control={
          <Select
            value={state.ring}
            disabled={!supported || busy}
            onValueChange={(value) => {
              if (isUpdateRing(value)) void setRing(value)
            }}
          >
            <SelectTrigger data-action="settings-update-ring" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stable">{language.t(RING_LABEL_KEYS.stable)}</SelectItem>
              <SelectItem value="preview">{language.t(RING_LABEL_KEYS.preview)}</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <SettingsRow
        title={language.t("settings.updates.checkTitle")}
        description={
          supported
            ? language.t("settings.updates.checkDescription")
            : language.t("settings.updates.unavailable")
        }
        control={
          <>
            {supported ? (
              <span className="text-xs text-text-weaker">
                {state.checkedAt
                  ? language.t("settings.updates.lastChecked", {
                      time: formatRelativeTime(state.checkedAt),
                    })
                  : language.t("settings.updates.neverChecked")}
              </span>
            ) : null}
            <Button
              data-action="settings-check-updates"
              type="button"
              size="sm"
              variant="secondary"
              disabled={!supported || busy}
              onClick={check}
            >
              {language.t("settings.updates.checkNow")}
            </Button>
          </>
        }
      />

      {confirmation.version ? (
        <ConfirmUpdateInstallDialog
          open={confirmation.open}
          version={confirmation.version}
          onOpenChange={confirmation.onOpenChange}
          onConfirm={confirmation.onConfirm}
        />
      ) : null}
    </SettingsSection>
  )
}
