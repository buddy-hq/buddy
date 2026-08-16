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
import type { UpdateRing } from "@/context/platform"
import { SettingsContent, SettingsRow, SettingsSection } from "./settings-primitives"
import {
  isUpdateRing,
  useUpdateSettings,
  type UpdateBanner,
  type UpdateBannerTone,
} from "./use-update-settings"

const BANNER_SURFACE = {
  neutral: "bg-surface-weak text-text-base",
  positive: "bg-surface-success-weak text-text-on-success-weak",
  critical: "bg-surface-critical-weak text-text-on-critical-weak",
} satisfies Record<UpdateBannerTone, string>

const RING_LABEL_KEYS = {
  stable: "settings.updates.ringStable",
  preview: "settings.updates.ringPreview",
} satisfies Record<UpdateRing, string>

const RING_DESCRIPTION_KEYS = {
  stable: "settings.updates.channelStableDescription",
  preview: "settings.updates.channelPreviewDescription",
} satisfies Record<UpdateRing, string>

function bannerActionLabel(banner: UpdateBanner): string | undefined {
  switch (banner.action) {
    case "install":
      return language.t("settings.updates.install")
    case "retry":
      return language.t("settings.updates.retry")
    case undefined:
      return undefined
  }
}

/**
 * Updater activity gets its own strip at the top of the card, and only exists
 * when there is something to say. An idle updater leaves three calm rows behind.
 */
function UpdateBannerStrip(props: {
  banner: UpdateBanner
  disabled: boolean
  onAction: () => void
}) {
  const actionLabel = bannerActionLabel(props.banner)

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
          {props.banner.busy ? <Spinner className="size-3.5 shrink-0" /> : null}
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-[13px] font-medium tracking-[-0.01em]">
              {props.banner.title}
            </p>
            {props.banner.detail ? (
              <p className="truncate text-xs opacity-80">{props.banner.detail}</p>
            ) : null}
          </div>
        </div>
        {actionLabel ? (
          <Button
            data-action="settings-update-banner-action"
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0"
            disabled={props.disabled}
            onClick={props.onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {props.banner.percent === undefined ? null : <Progress value={props.banner.percent} />}
    </div>
  )
}

export function UpdatesSettings() {
  const updates = useUpdateSettings()
  const banner = updates.banner

  function onBannerAction() {
    if (banner?.action === "install") {
      void updates.installUpdate()
      return
    }

    void updates.checkForUpdates()
  }

  return (
    <SettingsContent>
      <SettingsSection title={language.t("settings.updates.title")}>
        {banner ? (
          <UpdateBannerStrip
            banner={banner}
            disabled={!updates.supported || updates.busy}
            onAction={onBannerAction}
          />
        ) : null}

        <SettingsRow
          title={language.t("settings.updates.versionTitle")}
          control={
            <span className="text-xs text-text-weak tabular-nums">
              {updates.version ?? language.t("settings.updates.versionUnknown")}
            </span>
          }
        />

        <SettingsRow
          title={language.t("settings.updates.channelTitle")}
          description={language.t(RING_DESCRIPTION_KEYS[updates.ring])}
          control={
            <Select
              value={updates.ring}
              disabled={!updates.supported || updates.busy}
              onValueChange={(value) => {
                if (isUpdateRing(value)) {
                  void updates.changeRing(value)
                }
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
            updates.supported
              ? language.t("settings.updates.checkDescription")
              : language.t("settings.updates.unavailable")
          }
          control={
            <Button
              data-action="settings-check-updates"
              type="button"
              size="sm"
              variant="secondary"
              disabled={!updates.supported || updates.busy}
              onClick={() => void updates.checkForUpdates()}
            >
              {language.t("settings.updates.checkNow")}
            </Button>
          }
        />
      </SettingsSection>
    </SettingsContent>
  )
}
