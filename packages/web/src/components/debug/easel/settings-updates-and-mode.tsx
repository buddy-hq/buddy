import { useState } from "react"
import {
  Badge,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@buddy/ui"
import {
  AlertTriangleIcon,
  BookOpenTextIcon,
  CheckIcon,
  DownloadIcon,
  RefreshCwIcon,
  SchoolIcon,
  type AppIcon,
} from "@/icons/app-icons"
import {
  SettingsListCard,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-primitives"

/**
 * Two settings controls that both use a "pick one of two" pattern, and both
 * mis-state what the pick costs.
 *
 * Updates · the channel is a segmented ToggleGroup. Verified in
 * `settings-updates.tsx:174` and `desktop-electron/src/main/index.ts:922`:
 * choosing Preview calls `onCheckForUpdates()`, and on macOS the check *is* the
 * download — `checkCustomMacUpdate` streams progress inside `checkForUpdate`.
 * So a control shaped like a view switch pulls a release candidate onto the
 * machine. `autoUpdater.allowDowngrade = false`, so flipping back to Stable does
 * not undo it. Nothing in the row says any of that.
 *
 * Buddy mode · `FieldLabel` carries `has-data-checked:bg-surface-interactive-weak`
 * (`ui/components/ui/field.tsx:103`). At option-tile scale that tint is a hint; at
 * card scale it floods ~200×70px with brand purple, and the unselected card —
 * transparent, hairline border — reads as disabled rather than as a peer.
 *
 * Everything below is a prototype. No platform calls; state is local.
 */

const CURRENT_VERSION = "0.14.2"
const PENDING_VERSION = "0.15.0"
const PREVIEW_PENDING_VERSION = "0.15.0-rc.1"

type EaselPart = "updates" | "mode"

type UpdateChannel = "stable" | "preview"

/**
 * The six states the panel can be in. `up-to-date` is not an updater status — it
 * is the component's memory of the last `checkUpdate()` return, which today only
 * survives as a toast.
 */
type UpdateState = "idle" | "checking" | "downloading" | "ready" | "error" | "up-to-date"

type BuddyMode = "learn" | "teach"

type UpdateStateOption = {
  id: UpdateState
  label: string
}

const UPDATE_STATE_OPTIONS: UpdateStateOption[] = [
  { id: "idle", label: "Idle" },
  { id: "up-to-date", label: "Up to date" },
  { id: "checking", label: "Checking" },
  { id: "downloading", label: "Downloading" },
  { id: "ready", label: "Ready" },
  { id: "error", label: "Error" },
]

const DOWNLOAD_PERCENT = 62
const DOWNLOAD_RATE = "3.1 MB/s"

type ChannelCopy = {
  label: string
  meaning: string
}

const CHANNEL_COPY: Record<UpdateChannel, ChannelCopy> = {
  stable: {
    label: "Stable",
    meaning: "Installs releases after they have been approved.",
  },
  preview: {
    label: "Preview",
    meaning: "Installs release candidates first. Switching back does not roll you off one.",
  },
}

function pendingVersion(channel: UpdateChannel): string {
  return channel === "preview" ? PREVIEW_PENDING_VERSION : PENDING_VERSION
}

function toUpdateChannel(value: string): UpdateChannel {
  return value === "preview" ? "preview" : "stable"
}

/* ------------------------------------------------------------------------- */
/* Page furniture                                                            */
/* ------------------------------------------------------------------------- */

function PartTab(props: { active: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        props.active
          ? "bg-surface-raised-strong text-text-strong"
          : "text-text-weak hover:bg-surface-weak hover:text-text-base",
      )}
    >
      {props.label}
    </button>
  )
}

/** The settings content column at its real width, on the real background. */
function SettingsCanvas(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-weak-base bg-background-base p-5">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">{props.children}</div>
    </div>
  )
}

function DirectionBlock(props: {
  eyebrow: string
  title: string
  thesis: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
          {props.eyebrow}
        </span>
        <h3 className="text-sm font-semibold text-text-strong">{props.title}</h3>
        <p className="max-w-2xl text-xs text-text-weak">{props.thesis}</p>
      </header>
      {props.children}
    </section>
  )
}

function DefectList(props: { items: string[] }) {
  return (
    <ol className="flex max-w-2xl list-none flex-col gap-1.5">
      {props.items.map((item, index) => (
        <li key={item} className="flex gap-2.5 text-xs leading-relaxed text-text-weak">
          <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-weak text-[10px] font-semibold text-text-weaker">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------------- */
/* Updates · baseline                                                        */
/* ------------------------------------------------------------------------- */

function baselineStatusLabel(state: UpdateState, channel: UpdateChannel): string {
  switch (state) {
    case "checking":
      return "Checking for updates"
    case "downloading":
      return "Downloading update"
    case "ready":
      return `Buddy ${pendingVersion(channel)} is ready to install`
    case "error":
      return "Update check failed"
    case "up-to-date":
    case "idle":
      return "No update activity"
  }
}

/** The shipped panel, rebuilt from `settings-updates.tsx` with its real primitives. */
function UpdatesBaseline(props: { state: UpdateState; channel: UpdateChannel }) {
  const busy = props.state === "checking" || props.state === "downloading"

  return (
    <SettingsSection title="Updates">
      <SettingsRow
        title="Update channel"
        description="Stable installs approved releases. Preview installs release candidates before they are promoted."
        control={
          <ToggleGroup type="single" value={props.channel} variant="outline" size="sm">
            <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
            <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      <SettingsRow
        title="Manual check"
        description="Check GitHub for the newest release in the selected channel."
        control={
          <Button type="button" size="xs" variant="outline" disabled={busy}>
            {props.state === "checking" ? <Spinner data-icon="inline-start" /> : null}
            {props.state === "checking" ? "Checking..." : "Check for updates"}
          </Button>
        }
      />
      <SettingsRow
        title="Status"
        description="Current updater activity on this device."
        control={
          <div className="flex w-60 flex-col items-end gap-2 text-right">
            <span className="text-xs text-text-weak">
              {baselineStatusLabel(props.state, props.channel)}
            </span>
            {props.state === "downloading" ? (
              <div className="flex w-full flex-col gap-1.5">
                <Progress value={DOWNLOAD_PERCENT} />
                <span className="text-[11px] text-text-weaker">{DOWNLOAD_PERCENT}%</span>
              </div>
            ) : null}
          </div>
        }
      />
    </SettingsSection>
  )
}

type HeightSample = {
  label: string
  height: string
  node: React.ReactNode
}

/** The ragged right edge, measured. */
function ControlHeightRuler() {
  const samples: HeightSample[] = [
    {
      label: 'ToggleGroup size="sm"',
      height: "28px",
      node: (
        <ToggleGroup type="single" value="stable" variant="outline" size="sm">
          <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
        </ToggleGroup>
      ),
    },
    {
      label: 'Button size="xs"',
      height: "24px",
      node: (
        <Button type="button" size="xs" variant="outline">
          Check for updates
        </Button>
      ),
    },
    {
      label: 'Button size="sm"',
      height: "32px",
      node: (
        <Button type="button" size="sm" variant="outline">
          Check for updates
        </Button>
      ),
    },
    {
      label: "SelectTrigger default",
      height: "32px",
      node: (
        <Select value="stable">
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stable">Stable</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ]

  return (
    <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border-weak-base bg-surface-raised-base p-4">
      {samples.map((sample) => (
        <div key={sample.label} className="flex flex-col items-start gap-2">
          <div className="flex items-end border-b border-dashed border-border-base pb-0">
            {sample.node}
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[11px] text-text-base">{sample.label}</span>
            <span className="text-[11px] text-text-weaker">{sample.height}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Updates · direction A — status rides the version line                     */
/* ------------------------------------------------------------------------- */

type UpdateStatePresentation = {
  headline: string
  detail: string
  dotClass: string
}

function updatePresentation(state: UpdateState, channel: UpdateChannel): UpdateStatePresentation {
  switch (state) {
    case "checking":
      return {
        headline: `Buddy ${CURRENT_VERSION}`,
        detail: `Checking the ${CHANNEL_COPY[channel].label} channel…`,
        dotClass: "bg-icon-weak-base",
      }
    case "downloading":
      return {
        headline: `Buddy ${CURRENT_VERSION}`,
        detail: `Downloading ${pendingVersion(channel)} · ${DOWNLOAD_PERCENT}% · ${DOWNLOAD_RATE}`,
        dotClass: "bg-icon-interactive-base",
      }
    case "ready":
      return {
        headline: `Buddy ${pendingVersion(channel)} is downloaded`,
        detail: `Restart to move off ${CURRENT_VERSION}.`,
        dotClass: "bg-icon-success-base",
      }
    case "error":
      return {
        headline: `Buddy ${CURRENT_VERSION}`,
        detail: "Couldn't reach the update server.",
        dotClass: "bg-icon-critical-base",
      }
    case "up-to-date":
      return {
        headline: `Buddy ${CURRENT_VERSION}`,
        detail: `Up to date on the ${CHANNEL_COPY[channel].label} channel.`,
        dotClass: "bg-icon-success-base",
      }
    case "idle":
      return {
        headline: `Buddy ${CURRENT_VERSION}`,
        detail: `On the ${CHANNEL_COPY[channel].label} channel.`,
        dotClass: "bg-icon-weak-base",
      }
  }
}

type PrimaryAction = {
  label: string
  icon?: AppIcon
  variant: "default" | "outline"
  disabled: boolean
  busy: boolean
}

function primaryAction(state: UpdateState): PrimaryAction {
  switch (state) {
    case "checking":
      return { label: "Checking…", variant: "outline", disabled: true, busy: true }
    case "downloading":
      return { label: "Downloading…", variant: "outline", disabled: true, busy: true }
    case "ready":
      return {
        label: "Restart to install",
        icon: DownloadIcon,
        variant: "default",
        disabled: false,
        busy: false,
      }
    case "error":
      return {
        label: "Try again",
        icon: RefreshCwIcon,
        variant: "outline",
        disabled: false,
        busy: false,
      }
    case "up-to-date":
    case "idle":
      return { label: "Check for updates", variant: "outline", disabled: false, busy: false }
  }
}

function UpdatesDirectionA(props: {
  state: UpdateState
  channel: UpdateChannel
  onChannelChange: (channel: UpdateChannel) => void
}) {
  const presentation = updatePresentation(props.state, props.channel)
  const action = primaryAction(props.state)
  const ActionIcon = action.icon

  return (
    <SettingsSection title="Updates">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span
              className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", presentation.dotClass)}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="flex items-center gap-2 text-[13px] font-medium tracking-[-0.01em] text-text-base">
                <span className="truncate">{presentation.headline}</span>
                {props.channel === "preview" ? (
                  <Badge variant="outline" className="h-5">
                    Preview
                  </Badge>
                ) : null}
              </p>
              <p className="text-xs text-text-weaker">{presentation.detail}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant={action.variant}
            disabled={action.disabled}
            className="shrink-0"
          >
            {action.busy ? <Spinner data-icon="inline-start" /> : null}
            {!action.busy && ActionIcon ? <ActionIcon /> : null}
            {action.label}
          </Button>
        </div>
        {props.state === "downloading" ? <Progress value={DOWNLOAD_PERCENT} /> : null}
      </div>

      <div className="border-t border-border-base/60 px-4 py-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] font-medium tracking-[-0.01em] text-text-base">
            Update channel
          </p>
          <Select
            value={props.channel}
            onValueChange={(value) => props.onChannelChange(toUpdateChannel(value))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="preview">Preview</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="mt-1 max-w-md text-xs text-text-weaker">
          {CHANNEL_COPY[props.channel].meaning}
        </p>
        {props.channel === "preview" ? (
          <p className="mt-2 flex items-start gap-2 rounded-md bg-surface-warning-weak px-2.5 py-2 text-xs text-text-on-warning-weak">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              Choosing Preview downloads the current release candidate now. Switching back to Stable
              keeps you on it until a stable release passes it.
            </span>
          </p>
        ) : null}
      </div>
    </SettingsSection>
  )
}

/* ------------------------------------------------------------------------- */
/* Updates · direction B — state gets its own moment, or none at all         */
/* ------------------------------------------------------------------------- */

type BannerTone = "neutral" | "positive" | "critical"

type UpdateBanner = {
  title: string
  detail?: string
  tone: BannerTone
  actionLabel?: string
  busy: boolean
  showProgress: boolean
}

function updateBanner(state: UpdateState, channel: UpdateChannel): UpdateBanner | null {
  switch (state) {
    case "idle":
      return null
    case "up-to-date":
      return {
        title: `Up to date on ${CHANNEL_COPY[channel].label}`,
        tone: "positive",
        busy: false,
        showProgress: false,
      }
    case "checking":
      return {
        title: "Checking for updates…",
        tone: "neutral",
        busy: true,
        showProgress: false,
      }
    case "downloading":
      return {
        title: `Downloading ${pendingVersion(channel)}`,
        detail: `${DOWNLOAD_PERCENT}% · ${DOWNLOAD_RATE}`,
        tone: "neutral",
        busy: true,
        showProgress: true,
      }
    case "ready":
      return {
        title: `Buddy ${pendingVersion(channel)} is ready`,
        detail: "Downloaded and waiting for a restart.",
        tone: "positive",
        actionLabel: "Restart to install",
        busy: false,
        showProgress: false,
      }
    case "error":
      return {
        title: "Couldn't reach the update server",
        detail: "Buddy will keep running on this version.",
        tone: "critical",
        actionLabel: "Try again",
        busy: false,
        showProgress: false,
      }
  }
}

const BANNER_SURFACE: Record<BannerTone, string> = {
  neutral: "bg-surface-weak text-text-base",
  positive: "bg-surface-success-weak text-text-on-success-weak",
  critical: "bg-surface-critical-weak text-text-on-critical-weak",
}

function UpdatesDirectionB(props: {
  state: UpdateState
  channel: UpdateChannel
  onChannelChange: (channel: UpdateChannel) => void
}) {
  const banner = updateBanner(props.state, props.channel)

  return (
    <SettingsSection title="Updates">
      {banner ? (
        <div className={cn("flex flex-col gap-2 px-4 py-3 sm:px-5", BANNER_SURFACE[banner.tone])}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {banner.busy ? <Spinner className="size-3.5 shrink-0" /> : null}
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-[13px] font-medium tracking-[-0.01em]">
                  {banner.title}
                </p>
                {banner.detail ? (
                  <p className="truncate text-xs opacity-80">{banner.detail}</p>
                ) : null}
              </div>
            </div>
            {banner.actionLabel ? (
              <Button type="button" size="sm" variant="outline" className="shrink-0">
                {banner.actionLabel}
              </Button>
            ) : null}
          </div>
          {banner.showProgress ? <Progress value={DOWNLOAD_PERCENT} /> : null}
        </div>
      ) : null}

      <SettingsRow
        title="Buddy version"
        control={
          <span className="font-mono text-xs text-text-weak">
            {CURRENT_VERSION}
            {props.channel === "preview" ? " · preview" : ""}
          </span>
        }
      />
      <SettingsRow
        title="Update channel"
        description={CHANNEL_COPY[props.channel].meaning}
        control={
          <Select
            value={props.channel}
            onValueChange={(value) => props.onChannelChange(toUpdateChannel(value))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="preview">Preview</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <SettingsRow
        title="Manual check"
        description="Downloads the newest release in your channel if there is one."
        control={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={props.state === "checking" || props.state === "downloading"}
          >
            Check now
          </Button>
        }
      />
    </SettingsSection>
  )
}

/* ------------------------------------------------------------------------- */
/* Updates · the ledger of what the updater actually exposes                 */
/* ------------------------------------------------------------------------- */

type LedgerEntry = {
  field: string
  source: string
  available: boolean
}

const UPDATER_LEDGER: LedgerEntry[] = [
  { field: "Current version", source: "platform.version", available: true },
  { field: "Channel", source: "getUpdateRing() / setUpdateRing()", available: true },
  { field: "Status", source: "UpdateProgressSnapshot.status", available: true },
  { field: "Percent, bytes, rate", source: "UpdateProgressSnapshot", available: true },
  { field: "Pending version", source: "UpdateProgressSnapshot.version", available: true },
  { field: "Install / restart", source: "platform.update() + platform.restart()", available: true },
  { field: "Last checked at", source: "no field on any snapshot", available: false },
  { field: "Release notes", source: "never returned to the renderer", available: false },
  {
    field: "Latest available version, before downloading",
    source: "the check is the download",
    available: false,
  },
]

function UpdaterLedger() {
  return (
    <div className="overflow-hidden rounded-lg border border-border-weak-base">
      {UPDATER_LEDGER.map((entry) => (
        <div
          key={entry.field}
          className="flex items-center gap-3 border-b border-border-base/50 px-3 py-2 last:border-b-0"
        >
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
              entry.available
                ? "bg-surface-success-weak text-text-on-success-weak"
                : "bg-surface-critical-weak text-text-on-critical-weak",
            )}
            aria-hidden
          >
            {entry.available ? "✓" : "✕"}
          </span>
          <span className="w-64 shrink-0 text-xs text-text-base">{entry.field}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-weaker">
            {entry.source}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Updates part                                                              */
/* ------------------------------------------------------------------------- */

function UpdatesPart() {
  const [state, setState] = useState<UpdateState>("idle")
  const [baselineChannel, setBaselineChannel] = useState<UpdateChannel>("stable")
  const [channelA, setChannelA] = useState<UpdateChannel>("stable")
  const [channelB, setChannelB] = useState<UpdateChannel>("stable")

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
          Updater state
        </span>
        {UPDATE_STATE_OPTIONS.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="xs"
            variant={state === option.id ? "secondary" : "ghost"}
            onClick={() => setState(option.id)}
          >
            {option.label}
          </Button>
        ))}
        <span className="ml-2 text-[11px] text-text-weaker">
          Every panel below renders in this state.
        </span>
      </div>

      <DirectionBlock
        eyebrow="Shipping today"
        title="Three rows, one of them permanently empty"
        thesis="Rebuilt from settings-updates.tsx with its own primitives, so the defects are the real ones."
      >
        <SettingsCanvas>
          <UpdatesBaseline state={state} channel={baselineChannel} />
        </SettingsCanvas>
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-weak">
          <span>Flip the baseline channel to see how little the selection reads:</span>
          <ToggleGroup
            type="single"
            value={baselineChannel}
            variant="outline"
            size="sm"
            onValueChange={(value) => {
              if (value.length > 0) setBaselineChannel(toUpdateChannel(value))
            }}
          >
            <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
            <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <DefectList
          items={[
            "Selecting a channel starts a download. settings-updates.tsx:174 calls onCheckForUpdates() on switch, and on macOS checkCustomMacUpdate streams the file inside checkForUpdate. The control is shaped like a view toggle and costs a release candidate.",
            "The selection is nearly invisible. toggleVariants sets data-[state=on]:bg-surface-weak and hover:bg-surface-weak — the same value. A hovered channel and the chosen channel paint identically.",
            'The right column is ragged. ToggleGroup size="sm" is 28px, Button size="xs" is 24px, and the status column is a hand-set w-60 against everyone else\'s sm:min-w-44. Three rows, three widths, two heights.',
            'The Status row is empty most of the time. It is a permanently mounted row whose usual content is the words "No update activity".',
            'When an update is ready, the panel cannot install it. It prints "ready to install" and leaves the action in a toast the user has to still have on screen.',
            "The version is never shown. platform.version is available and is the one fact an Updates panel exists to state.",
          ]}
        />
        <ControlHeightRuler />
      </DirectionBlock>

      <DirectionBlock
        eyebrow="Direction A"
        title="State rides the version line"
        thesis="The panel leads with what you're running. Status is that line's subtitle, so it is never a row of its own and never blank. One action, relabelled by state, ending in the restart the panel currently can't offer. The channel drops to the Select idiom the Appearance tab already uses, with the cost stated in place."
      >
        <SettingsCanvas>
          <UpdatesDirectionA state={state} channel={channelA} onChannelChange={setChannelA} />
        </SettingsCanvas>
      </DirectionBlock>

      <DirectionBlock
        eyebrow="Direction B"
        title="State gets its own moment, or none at all"
        thesis="Keeps the row list — the most house-consistent shape — and gives activity a banner that only exists when there is something to say. Idle is three calm rows and no status anywhere; ready is loud and carries its own action. Same Select, same single control height."
      >
        <SettingsCanvas>
          <UpdatesDirectionB state={state} channel={channelB} onChannelChange={setChannelB} />
        </SettingsCanvas>
      </DirectionBlock>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-strong">
          What the updater actually hands the renderer
        </h3>
        <p className="max-w-2xl text-xs text-text-weak">
          Nothing above invents a field. These are the three things a richer Updates tab would want
          and cannot have without backend work.
        </p>
        <UpdaterLedger />
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Buddy mode                                                                */
/* ------------------------------------------------------------------------- */

type ModeOption = {
  value: BuddyMode
  shortLabel: string
  title: string
  description: string
  icon: AppIcon
  consequence: string
}

const MODE_OPTION_BY_VALUE: Record<BuddyMode, ModeOption> = {
  learn: {
    value: "learn",
    shortLabel: "Learning",
    title: "Learn with Buddy",
    description: "Explore, practise, and remember what matters to you.",
    icon: BookOpenTextIcon,
    consequence: "Settings stays on the learner set.",
  },
  teach: {
    value: "teach",
    shortLabel: "Teaching",
    title: "Teach with Buddy",
    description: "Plan, create, and assess learning experiences.",
    icon: SchoolIcon,
    consequence: "Adds Standards to your main Settings tabs.",
  },
}

const MODE_OPTIONS: ModeOption[] = [MODE_OPTION_BY_VALUE.learn, MODE_OPTION_BY_VALUE.teach]

function toBuddyMode(value: string): BuddyMode {
  return value === "teach" ? "teach" : "learn"
}

/** The shipped control, using the same Field/RadioGroup markup as the real form. */
function ModeBaseline() {
  const [mode, setMode] = useState<BuddyMode>("learn")

  return (
    <RadioGroup
      aria-label="Default way Buddy works"
      className="grid-cols-1 sm:grid-cols-2"
      value={mode}
      onValueChange={(value) => setMode(toBuddyMode(value))}
    >
      {MODE_OPTIONS.map((option) => {
        const Icon = option.icon

        return (
          <FieldLabel
            key={option.value}
            htmlFor={`baseline-mode-${option.value}`}
            className="cursor-pointer"
          >
            <Field orientation="horizontal" className="min-w-0 gap-3">
              <Icon className="size-4 shrink-0 text-icon-base" />
              <FieldContent>
                <FieldTitle>{option.title}</FieldTitle>
                <FieldDescription>{option.description}</FieldDescription>
              </FieldContent>
              <RadioGroupItem id={`baseline-mode-${option.value}`} value={option.value} />
            </Field>
          </FieldLabel>
        )
      })}
    </RadioGroup>
  )
}

/** Direction A — the same row shape as every other settings row. */
function ModeDirectionA() {
  const [mode, setMode] = useState<BuddyMode>("learn")
  const option = MODE_OPTION_BY_VALUE[mode]

  return (
    <SettingsListCard>
      <SettingsRow
        title="Default way Buddy works"
        description={`${option.description} ${option.consequence}`}
        control={
          <Select value={mode} onValueChange={(value) => setMode(toBuddyMode(value))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.shortLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingsListCard>
  )
}

/** Direction B — keep the cards, drop the flood. */
function ModeDirectionB() {
  const [mode, setMode] = useState<BuddyMode>("learn")

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon
          const selected = option.value === mode

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setMode(option.value)}
              className={cn(
                "flex min-w-0 items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                selected
                  ? "border-border-interactive-base bg-surface-raised-strong"
                  : "border-border-base/50 bg-surface-raised-base hover:bg-surface-raised-base-hover",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  selected ? "text-icon-interactive-base" : "text-icon-weak-base",
                )}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-medium tracking-[-0.01em] text-text-base">
                  {option.title}
                </span>
                <span className="text-xs text-text-weaker">{option.description}</span>
              </span>
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  selected
                    ? "border-border-interactive-base bg-surface-interactive-base text-text-on-interactive-base"
                    : "border-border-base",
                )}
                aria-hidden
              >
                {selected ? <CheckIcon className="size-2.5" /> : null}
              </span>
            </button>
          )
        })}
      </div>
      <p className="px-1 text-xs text-text-weaker">{MODE_OPTION_BY_VALUE[mode].consequence}</p>
    </div>
  )
}

/** Direction C — two rows in one card, the list idiom the rest of Settings uses. */
function ModeDirectionC() {
  const [mode, setMode] = useState<BuddyMode>("learn")

  return (
    <SettingsListCard>
      <RadioGroup
        aria-label="Default way Buddy works"
        className="gap-0"
        value={mode}
        onValueChange={(value) => setMode(toBuddyMode(value))}
      >
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon
          const selected = option.value === mode

          return (
            <label
              key={option.value}
              htmlFor={`row-mode-${option.value}`}
              className={cn(
                "relative flex cursor-pointer items-center gap-3 border-t border-border-base/60 px-4 py-3.5 transition-colors first:border-t-0 sm:px-5",
                selected ? "bg-surface-weak" : "hover:bg-surface-raised-base-hover",
              )}
            >
              {selected ? (
                <span
                  className="absolute inset-y-0 left-0 w-0.5 bg-surface-interactive-base"
                  aria-hidden
                />
              ) : null}
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  selected ? "text-icon-interactive-base" : "text-icon-weak-base",
                )}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-medium tracking-[-0.01em] text-text-base">
                  {option.title}
                </span>
                <span className="text-xs text-text-weaker">
                  {option.description} {selected ? "" : option.consequence}
                </span>
              </span>
              <RadioGroupItem id={`row-mode-${option.value}`} value={option.value} />
            </label>
          )
        })}
      </RadioGroup>
    </SettingsListCard>
  )
}

function ModePart() {
  return (
    <div className="flex flex-col gap-10">
      <DirectionBlock
        eyebrow="Shipping today"
        title="One card floods, the other looks disabled"
        thesis="The real markup from shared-personalization-form.tsx — RadioGroup, FieldLabel, Field. Click either card."
      >
        <SettingsCanvas>
          <div className="space-y-2.5">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
              Default way Buddy works
            </h3>
            <ModeBaseline />
          </div>
        </SettingsCanvas>
        <DefectList
          items={[
            "FieldLabel carries has-data-checked:bg-surface-interactive-weak. That tint was sized for a small option tile; at card scale it fills ~200×70px with brand purple, which outweighs every other element on the Personalization page.",
            "The unselected card is transparent with a hairline border, so the pair reads as one enabled button beside one disabled button rather than two peers with one chosen.",
            "Two selection signals compete: the whole card is filled and a radio dot is also lit. Either alone would carry it.",
            "This is the only control on the page that is a mode rather than a preference — picking Teach adds the Standards tab to Settings (settings-tabs.tsx:202) — and nothing in the UI says a consequence follows.",
            "It sits under a section header with no card around it, so it is the one control on the settings surface that does not live in a SettingsListCard.",
          ]}
        />
      </DirectionBlock>

      <DirectionBlock
        eyebrow="Direction A"
        title="It is a setting, so it is a settings row"
        thesis="One row in one card, exactly like Appearance's colour scheme and theme. The description under the title is always the description of what is currently selected, and carries the consequence. Cheapest to build, hardest to notice — which may be right for something you set once."
      >
        <SettingsCanvas>
          <div className="space-y-2.5">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
              Default way Buddy works
            </h3>
            <ModeDirectionA />
          </div>
        </SettingsCanvas>
      </DirectionBlock>

      <DirectionBlock
        eyebrow="Direction B"
        title="Keep the cards, kill the flood"
        thesis="Both cards stay lit surfaces, so they read as peers. Selection is carried by border, a raised surface, a tinted glyph and a check — four quiet signals instead of one loud fill. Worth the space if this choice should keep feeling like a fork in the road."
      >
        <SettingsCanvas>
          <div className="space-y-2.5">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
              Default way Buddy works
            </h3>
            <ModeDirectionB />
          </div>
        </SettingsCanvas>
      </DirectionBlock>

      <DirectionBlock
        eyebrow="Direction C"
        title="Two rows in the card everything else lives in"
        thesis="The list idiom: same padding, same separator, same radio as the rest of the surface. Selection is a left accent and a weak fill. Keeps both descriptions readable — unlike the Select — without spending card real estate."
      >
        <SettingsCanvas>
          <div className="space-y-2.5">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
              Default way Buddy works
            </h3>
            <ModeDirectionC />
          </div>
        </SettingsCanvas>
      </DirectionBlock>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

export function SettingsUpdatesAndModeEasel() {
  const [part, setPart] = useState<EaselPart>("updates")

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6 overflow-y-auto bg-background-base p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-text-strong">
            Settings · two controls that hide what the pick costs
          </h2>
          <p className="max-w-3xl text-sm text-text-weak">
            The update channel is a segmented toggle that quietly downloads a release candidate, and
            the Buddy mode is a pair of cards where the chosen one floods with brand purple. Both
            are the same mistake in different directions: a control whose weight does not match its
            consequence.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border-weak-base bg-surface-raised-base p-1">
          <PartTab
            active={part === "updates"}
            label="Updates tab"
            onSelect={() => setPart("updates")}
          />
          <PartTab
            active={part === "mode"}
            label="Default way Buddy works"
            onSelect={() => setPart("mode")}
          />
        </div>
      </header>

      {part === "updates" ? <UpdatesPart /> : <ModePart />}
    </div>
  )
}
