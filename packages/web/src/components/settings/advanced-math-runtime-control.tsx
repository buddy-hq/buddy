import { Badge, Progress, Switch, cn } from "@buddy/ui"
import { language } from "@/context/language"
import { parseTNumber } from "@/components/chat/tools/types"
import type { Platform } from "@/context/platform"
import type { AdvancedMathRuntimeStatus } from "@/state/advanced-math-runtime"
import { advancedMathStatusLabel, formatRuntimeVersion } from "./use-advanced-math-runtime"

type AdvancedMathRuntimeControlProps = {
  os: Platform["os"]
  status: AdvancedMathRuntimeStatus | null
  loading: boolean
  busy: boolean
  enabled: boolean
  onToggle: (checked: boolean) => void
  showStatusLabel?: boolean
}

export function isAdvancedMathRuntimeSupported(os: Platform["os"]) {
  return os !== "windows"
}

export function advancedMathRuntimeDescription(os: Platform["os"]) {
  return isAdvancedMathRuntimeSupported(os)
    ? language.t("settings.appearance.advancedMathDescription")
    : language.t("settings.appearance.advancedMathComingSoonDescription")
}

export function AdvancedMathRuntimeControl(props: AdvancedMathRuntimeControlProps) {
  const progressPercent = parseTNumber(props.status?.progressPercent)
  if (!isAdvancedMathRuntimeSupported(props.os)) {
    return (
      <Badge variant="outline" className="h-7 px-3 text-text-weak">
        {language.t("settings.appearance.comingSoon")}
      </Badge>
    )
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-3",
          props.showStatusLabel ? "justify-between" : "justify-end",
        )}
      >
        {props.showStatusLabel ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-text-weak">
              {advancedMathStatusLabel(props.status, props.loading)}
            </span>
            {props.status?.installedRuntimeVersion ? (
              <span className="text-[11px] text-text-subtle">
                {formatRuntimeVersion(props.status.installedRuntimeVersion)}
              </span>
            ) : null}
          </div>
        ) : null}
        <Switch
          data-action="settings-advanced-math-toggle"
          aria-label={language.t("settings.appearance.advancedMathToggleAria")}
          checked={props.enabled}
          disabled={props.busy || props.status === null}
          onCheckedChange={props.onToggle}
        />
      </div>
      {!props.showStatusLabel && props.status?.installedRuntimeVersion ? (
        <span className="text-[11px] text-text-subtle">
          {formatRuntimeVersion(props.status.installedRuntimeVersion)}
        </span>
      ) : null}
      {props.status?.progressMessage || progressPercent !== undefined ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-text-weak">
            <span className="truncate">
              {props.status?.progressMessage ?? language.t("settings.appearance.working")}
            </span>
            {progressPercent !== undefined ? (
              <span>{Math.round(progressPercent)}%</span>
            ) : null}
          </div>
          <Progress value={progressPercent ?? 0} className="h-1.5" />
        </div>
      ) : null}
      {props.status?.lastError ? (
        <p className="text-xs text-icon-critical-base">{props.status.lastError}</p>
      ) : null}
    </div>
  )
}
