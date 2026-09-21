import type { UpdateState } from "@buddy/update-contract"
import {
  Button,
  DownloadIcon,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  RefreshIcon,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ConfirmUpdateInstallDialog } from "./confirm-update-install-dialog"
import { UpdateReleaseNotes } from "./update-release-notes"
import {
  describeUpdateAction,
  describeUpdateFailure,
  describeUpdateHint,
  describeUpdateStatus,
  describeUpdateTooltip,
  showsUpdateChangelog,
  updateDownloadPercent,
} from "./update-presentation"
import { useUpdateControl } from "./use-update-control"

const HOVER_OPEN_DELAY_MS = 200
const HOVER_CLOSE_DELAY_MS = 120
const PROGRESS_RADIUS = 14
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS

function DownloadProgressRing(props: { percent: number }) {
  const offset = PROGRESS_CIRCUMFERENCE * (1 - props.percent / 100)

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full -rotate-90"
      viewBox="0 0 32 32"
    >
      <circle
        cx="16"
        cy="16"
        r={PROGRESS_RADIUS}
        fill="none"
        className="stroke-border-weak-base"
        strokeWidth="1.5"
      />
      <circle
        cx="16"
        cy="16"
        r={PROGRESS_RADIUS}
        fill="none"
        className="stroke-icon-interactive-base transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none"
        strokeDasharray={PROGRESS_CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function PendingDot() {
  return (
    <span
      aria-hidden
      className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-icon-interactive-base ring-2 ring-background-base"
    />
  )
}

function UpdateStatusIcon(props: { state: UpdateState }) {
  const { activity } = props.state
  switch (activity.status) {
    case "checking":
      return (
        <RefreshIcon className="size-3.5 animate-[spin_2s_linear_infinite] motion-reduce:animate-none" />
      )
    case "installing":
      return (
        <Spinner className="size-3.5 animate-[spin_2s_linear_infinite] motion-reduce:animate-none" />
      )
    case "downloading": {
      const percent = updateDownloadPercent(props.state)
      if (percent === undefined) {
        return (
          <Spinner className="size-3.5 animate-[spin_2s_linear_infinite] motion-reduce:animate-none" />
        )
      }
      return (
        <>
          <DownloadProgressRing percent={percent} />
          <DownloadIcon className="size-3.5" />
        </>
      )
    }
    case "available":
      return (
        <>
          <DownloadIcon className="size-3.5" />
          <PendingDot />
        </>
      )
    case "downloaded":
      return null
    case "unsupported":
    case "idle":
    case "up-to-date":
    case "blocked":
      return <RefreshIcon className="size-3.5" />
  }
}

export function UpdateStatusButton() {
  const platform = usePlatform()
  const { state, action, perform, confirmation } = useUpdateControl()

  if (state.activity.status === "unsupported") return null

  const status = describeUpdateStatus(state)
  const failure = state.failure ? describeUpdateFailure(state.failure) : undefined
  const hint = describeUpdateHint(action, state.failure)
  const accessibleLabel = [failure, status, describeUpdateAction(action, state.failure)]
    .filter(Boolean)
    .join(". ")
  const offersUpdate = action === "download" || action === "install"

  const button =
    action === "install" ? (
      <Button
        type="button"
        size="xs"
        data-action="sidebar-update-status"
        data-update-status={state.activity.status}
        aria-label={accessibleLabel}
        className="bg-surface-interactive-base text-text-on-interactive-base"
        onClick={perform}
      >
        {language.t("updates.button.install")}
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-action="sidebar-update-status"
        data-update-status={state.activity.status}
        aria-label={accessibleLabel}
        aria-disabled={action === "none" || undefined}
        className={cn(
          "relative rounded-lg text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong",
          offersUpdate && "text-text-strong",
          state.failure && "text-text-critical-base hover:text-text-critical-strong",
          action === "none" && "cursor-default hover:bg-transparent",
        )}
        onClick={perform}
      >
        <UpdateStatusIcon state={state} />
      </Button>
    )

  return (
    <>
      {showsUpdateChangelog(state, action) ? (
        <HoverCard openDelay={HOVER_OPEN_DELAY_MS} closeDelay={HOVER_CLOSE_DELAY_MS}>
          <HoverCardTrigger asChild>{button}</HoverCardTrigger>
          <HoverCardContent
            side="top"
            align="end"
            sideOffset={8}
            className="flex w-72 flex-col gap-2.5 p-3"
          >
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-text-strong">{status}</p>
              {hint ? <p className="text-xs text-text-weak">{hint}</p> : null}
            </div>
            <UpdateReleaseNotes
              notes={state.releaseNotes}
              onOpenRelease={(url) => platform.openLink(url)}
            />
          </HoverCardContent>
        </HoverCard>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {describeUpdateTooltip(state, action)}
          </TooltipContent>
        </Tooltip>
      )}
      {confirmation.version ? (
        <ConfirmUpdateInstallDialog
          open={confirmation.open}
          version={confirmation.version}
          onOpenChange={confirmation.onOpenChange}
          onConfirm={confirmation.onConfirm}
        />
      ) : null}
    </>
  )
}
