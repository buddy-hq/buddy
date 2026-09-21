import { useLayoutEffect, useState, type ReactNode } from "react"
import type { UpdateReleaseNote, UpdateRing, UpdateState } from "@buddy/update-contract"
import {
  UPDATE_RING_STABLE,
  beginCheck,
  beginDownload,
  beginInstall,
  completeCheckAvailable,
  completeCheckBlocked,
  completeCheckUpToDate,
  completeDownload,
  createUpdateState,
  failCheck,
  failDownload,
  failInstall,
  reportDownloadProgress,
  resolveUpdateAction,
  selectRing,
} from "@buddy/update-contract"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  CircleCheckIcon,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Z_INDEX,
  cn,
} from "@buddy/ui"
import { language } from "@/context/language"
import { PlatformProvider, setRuntimePlatform, usePlatform, type Platform } from "@/context/platform"
import { SettingsIcon } from "@/components/layout/sidebar-icons"
import { UpdatesSettingsSection } from "@/components/settings/settings-updates-section"
import { UpdateReleaseNotes } from "@/components/updates/update-release-notes"
import { UpdateStatusButton } from "@/components/updates/update-status-button"
import {
  describeUpdateHint,
  describeUpdateStatus,
  describeUpdateTooltip,
  showsUpdateChangelog,
} from "@/components/updates/update-presentation"
import {
  useUpdateControl,
  type UpdateInstallConfirmation,
} from "@/components/updates/use-update-control"
import { findCatalogID } from "./select-value"

const DEVTOOLS_LAYER = { zIndex: Z_INDEX.devtoolsFloating }

const CURRENT_VERSION = "0.14.2"
const NEXT_VERSION = "0.15.0"
const PATCH_VERSION = "0.14.3"
const DOWNLOAD_BYTES = 148_000_000
const DOWNLOAD_BYTES_PER_SECOND = 9_600_000

const NEW_SURFACES = [
  "Sidebar update button",
  "Its tooltip and release-notes card",
  "Release notes",
  "Restart confirmation",
  "“Ready” toast",
  "Settings → About, reworked",
  "App menu → Settings → About",
]

const FLOW_STEPS = ["Check", "Available", "Download", "Ready", "Confirm restart", "Relaunch"]

const RETIRED_SURFACES = [
  "“Update ready to install” toast with Install & restart / Later",
  "Checking, downloading and installing progress toasts",
  "Native “Update Ready · Restart now?”, “Update Error” and “No updates available” dialogs",
  "Background checks that downloaded a release as soon as they found one",
]

function releaseUrl(version: string): string {
  return `https://example.com/buddy/releases/v${version}`
}

function ignoreReleaseLink(): void {}

const NEXT_RELEASE_ITEMS = [
  "Buddy checks for updates in the background and downloads only when you click",
  "A new update button next to Settings shows what the updater is doing",
  "See what's new before you download",
  "Buddy asks before restarting to install",
  "Settings → About shows when Buddy last checked",
  "Check for Updates… in the app menu opens Settings → About",
  "Changing the update channel no longer downloads anything by itself",
  "Background checks wait for a download you started",
]

function releaseFor(version: string): UpdateReleaseNote {
  return {
    version,
    url: releaseUrl(version),
    items: NEXT_RELEASE_ITEMS,
    totalItems: NEXT_RELEASE_ITEMS.length + 3,
  }
}

const NEXT_RELEASE = releaseFor(NEXT_VERSION)

const PATCH_RELEASE: UpdateReleaseNote = {
  version: PATCH_VERSION,
  url: releaseUrl(PATCH_VERSION),
  items: ["Flashcard decks keep their order after a restart", "Faster search in large notebooks"],
  totalItems: 2,
}

const RELEASE_NOTE_VARIANTS = [
  {
    id: "complete",
    label: "Every line fits → “Full release notes”",
    notes: [PATCH_RELEASE],
  },
  {
    id: "one-cut",
    label: "One line cut → “1 more change”",
    notes: [{ ...NEXT_RELEASE, totalItems: NEXT_RELEASE_ITEMS.length + 1 }],
  },
  {
    id: "two-releases",
    label: "Two releases since yours → “In 0.14.3”",
    notes: [NEXT_RELEASE, PATCH_RELEASE],
  },
]

type UpdateShell = Required<
  Pick<
    Platform,
    | "getUpdateState"
    | "onUpdateState"
    | "checkUpdate"
    | "downloadUpdate"
    | "installUpdate"
    | "setUpdateRing"
  >
>

function frozenShell(state: UpdateState): UpdateShell {
  const read = async () => state
  return {
    getUpdateState: read,
    onUpdateState: () => () => undefined,
    checkUpdate: read,
    downloadUpdate: read,
    installUpdate: read,
    setUpdateRing: read,
  }
}

/** Restore the module-level platform after rendering with the fake provider. */
function FakeShell(props: { shell: UpdateShell; children: ReactNode }) {
  const platform = usePlatform()
  const [fake] = useState<Platform>(() => ({ ...platform, ...props.shell }))

  useLayoutEffect(() => {
    setRuntimePlatform(platform)
  })

  return <PlatformProvider value={fake}>{props.children}</PlatformProvider>
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

const INSTALLED = createUpdateState({
  currentVersion: CURRENT_VERSION,
  ring: UPDATE_RING_STABLE,
  supported: true,
})
const CHECKING = beginCheck(INSTALLED)
const AVAILABLE = completeCheckAvailable(CHECKING, {
  version: NEXT_VERSION,
  checkedAt: minutesAgo(2),
  releaseNotes: [NEXT_RELEASE],
})
const DOWNLOAD_STARTED = beginDownload(AVAILABLE, { version: NEXT_VERSION })
const DOWNLOADING = reportDownloadProgress(DOWNLOAD_STARTED, {
  percent: 42,
  transferredBytes: DOWNLOAD_BYTES * 0.42,
  totalBytes: DOWNLOAD_BYTES,
  bytesPerSecond: DOWNLOAD_BYTES_PER_SECOND,
})
const DOWNLOADED = completeDownload(DOWNLOADING, { version: NEXT_VERSION })
const INSTALLING = beginInstall(DOWNLOADED, { version: NEXT_VERSION })

type StatePreview = {
  id: string
  label: string
  note: string
  state: UpdateState
  shell: UpdateShell
}

function preview(entry: Omit<StatePreview, "shell">): StatePreview {
  return { ...entry, shell: frozenShell(entry.state) }
}

const STATE_PREVIEWS: StatePreview[] = [
  preview({
    id: "idle",
    label: "Idle",
    note: "Nothing checked yet. The first background check runs 20 s after launch, then every 30 min.",
    state: INSTALLED,
  }),
  preview({
    id: "checking",
    label: "Checking",
    note: "A check is in flight. The button does nothing until it lands.",
    state: CHECKING,
  }),
  preview({
    id: "up-to-date",
    label: "Up to date",
    note: "The last check found nothing newer.",
    state: completeCheckUpToDate(CHECKING, { checkedAt: minutesAgo(3) }),
  }),
  preview({
    id: "blocked",
    label: "On hold",
    note: "The newest release is held back. Updates resume on their own.",
    state: completeCheckBlocked(CHECKING, { checkedAt: minutesAgo(3) }),
  }),
  preview({
    id: "available",
    label: "Available",
    note: "Found, not downloaded. Nothing transfers until the user clicks.",
    state: AVAILABLE,
  }),
  preview({
    id: "downloading-unsized",
    label: "Downloading · no size yet",
    note: "Until the transfer reports a total, the icon is a spinner.",
    state: DOWNLOAD_STARTED,
  }),
  preview({
    id: "downloading",
    label: "Downloading · 42%",
    note: "A ring around the icon fills with the transfer.",
    state: DOWNLOADING,
  }),
  preview({
    id: "downloaded",
    label: "Ready to install",
    note: "A press opens the restart confirmation, never a silent restart.",
    state: DOWNLOADED,
  }),
  preview({
    id: "installing",
    label: "Installing",
    note: "Buddy is about to quit and relaunch.",
    state: INSTALLING,
  }),
  preview({
    id: "check-failed",
    label: "Check failed",
    note: "A press runs the check again.",
    state: failCheck(CHECKING, { checkedAt: minutesAgo(1) }),
  }),
  preview({
    id: "download-failed",
    label: "Download failed",
    note: "Back to offering the same version. A press downloads it again.",
    state: failDownload(DOWNLOADING),
  }),
  preview({
    id: "install-failed",
    label: "Install failed",
    note: "Back to ready. A press reopens the restart confirmation.",
    state: failInstall(INSTALLING),
  }),
  preview({
    id: "check-failed-while-ready",
    label: "Check failed · update already downloaded",
    note: "A failed check never hides a ready update. A press still installs.",
    state: failCheck(beginCheck(DOWNLOADED), { checkedAt: minutesAgo(1) }),
  }),
  preview({
    id: "unsupported",
    label: "Unsupported build",
    note: "Dev and web builds. The button is hidden and the settings controls are disabled.",
    state: createUpdateState({
      currentVersion: CURRENT_VERSION,
      ring: UPDATE_RING_STABLE,
      supported: false,
    }),
  }),
]

type CheckResult = "available" | "up-to-date" | "blocked" | "fails"
type StepResult = "succeeds" | "fails"

type FlowScript = {
  check: CheckResult
  download: StepResult
  install: StepResult
}

const DEFAULT_SCRIPT: FlowScript = { check: "available", download: "succeeds", install: "succeeds" }

const CHECK_RESULTS: { id: CheckResult; label: string }[] = [
  { id: "available", label: "Finds an update" },
  { id: "up-to-date", label: "Up to date" },
  { id: "blocked", label: "On hold" },
  { id: "fails", label: "Fails" },
]

const DOWNLOAD_RESULTS: { id: StepResult; label: string }[] = [
  { id: "succeeds", label: "Succeeds" },
  { id: "fails", label: "Fails at 60%" },
]

const INSTALL_RESULTS: { id: StepResult; label: string }[] = [
  { id: "succeeds", label: "Relaunches" },
  { id: "fails", label: "Fails" },
]

const CHECK_MS = 1_200
const DOWNLOAD_PREPARE_MS = 700
const DOWNLOAD_TICK_MS = 90
const DOWNLOAD_PERCENT_STEP = 4
const DOWNLOAD_FAIL_PERCENT = 60
const INSTALL_MS = 1_800

function nextMinorVersion(version: string): string {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number(part))
  return `${major}.${minor + 1}.0`
}

type SimulatedShell = {
  shell: UpdateShell
  setScript: (script: FlowScript) => void
  reset: () => void
}

/** Simulate serialized transitions; resetting invalidates work from the prior run. */
function createSimulatedShell(initialScript: FlowScript): SimulatedShell {
  const listeners = new Set<(state: UpdateState) => void>()
  let script = initialScript
  let run = 0
  let queue: Promise<void> = Promise.resolve()
  let state = INSTALLED

  const commit = (next: UpdateState): UpdateState => {
    if (next === state) return state
    state = { ...next, revision: state.revision + 1 }
    for (const listener of listeners) listener(state)
    return state
  }

  const exclusive = (step: () => Promise<UpdateState>): Promise<UpdateState> => {
    const result = queue.then(step)
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const interrupted = async (ms: number, startedRun: number): Promise<boolean> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })
    return startedRun !== run
  }

  const check = async (): Promise<UpdateState> => {
    const startedRun = run
    commit(beginCheck(state))
    if (await interrupted(CHECK_MS, startedRun)) return state

    const checkedAt = new Date().toISOString()
    switch (script.check) {
      case "available": {
        const version = nextMinorVersion(state.currentVersion)
        return commit(
          completeCheckAvailable(state, { version, checkedAt, releaseNotes: [releaseFor(version)] }),
        )
      }
      case "up-to-date":
        return commit(completeCheckUpToDate(state, { checkedAt }))
      case "blocked":
        return commit(completeCheckBlocked(state, { checkedAt }))
      case "fails":
        return commit(failCheck(state, { checkedAt }))
    }
  }

  const download = async (): Promise<UpdateState> => {
    if (state.activity.status !== "available") return state
    const startedRun = run
    const { version } = state.activity

    commit(beginDownload(state, { version }))
    if (await interrupted(DOWNLOAD_PREPARE_MS, startedRun)) return state

    for (let percent = 0; percent <= 100; percent += DOWNLOAD_PERCENT_STEP) {
      if (script.download === "fails" && percent >= DOWNLOAD_FAIL_PERCENT) {
        return commit(failDownload(state))
      }
      commit(
        reportDownloadProgress(state, {
          percent,
          transferredBytes: (DOWNLOAD_BYTES * percent) / 100,
          totalBytes: DOWNLOAD_BYTES,
          bytesPerSecond: DOWNLOAD_BYTES_PER_SECOND,
        }),
      )
      if (await interrupted(DOWNLOAD_TICK_MS, startedRun)) return state
    }
    return commit(completeDownload(state, { version }))
  }

  const install = async (): Promise<UpdateState> => {
    if (state.activity.status !== "downloaded") return state
    const startedRun = run
    const { version } = state.activity

    commit(beginInstall(state, { version }))
    if (await interrupted(INSTALL_MS, startedRun)) return state
    if (script.install === "fails") return commit(failInstall(state))

    return commit(createUpdateState({ currentVersion: version, ring: state.ring, supported: true }))
  }

  return {
    shell: {
      getUpdateState: async () => state,
      onUpdateState: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      checkUpdate: () => exclusive(check),
      downloadUpdate: () => exclusive(download),
      installUpdate: () => exclusive(install),
      setUpdateRing: (ring: UpdateRing) => exclusive(async () => commit(selectRing(state, ring))),
    },
    setScript: (next) => {
      script = next
    },
    reset: () => {
      run += 1
      commit(INSTALLED)
    },
  }
}

const HOVER_CARD_SURFACE =
  "rounded-lg bg-surface-raised-stronger-non-alpha text-sm text-text-base shadow-md ring-1 ring-border-weak-base"

function UpdateCardBody(props: { state: UpdateState }) {
  const action = resolveUpdateAction(props.state)
  const status = describeUpdateStatus(props.state)
  const hint = describeUpdateHint(action, props.state.failure)

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-text-strong">{status}</p>
        {hint ? <p className="text-xs text-text-weak">{hint}</p> : null}
      </div>
      <UpdateReleaseNotes notes={props.state.releaseNotes} onOpenRelease={ignoreReleaseLink} />
    </>
  )
}

function TooltipStill(props: { children: ReactNode }) {
  return (
    <div className="inline-flex w-fit max-w-xs items-center rounded-md bg-text-strong px-3 py-1.5 text-xs text-background-base">
      {props.children}
    </div>
  )
}

function HoverCardStill(props: { children: ReactNode }) {
  return (
    <div className={cn(HOVER_CARD_SURFACE, "flex w-72 flex-col gap-2.5 p-3")}>
      {props.children}
    </div>
  )
}

function RestartConfirmation(props: { confirmation: UpdateInstallConfirmation }) {
  const { confirmation } = props
  if (!confirmation.version) return null

  return (
    <AlertDialog open={confirmation.open} onOpenChange={confirmation.onOpenChange}>
      <AlertDialogContent style={DEVTOOLS_LAYER}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {language.t("updates.confirm.title", { version: confirmation.version })}
          </AlertDialogTitle>
          <AlertDialogDescription>{language.t("updates.confirm.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default">
            {language.t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="default"
            size="default"
            onClick={() => {
              confirmation.onConfirm()
              confirmation.onOpenChange(false)
            }}
          >
            {language.t("updates.confirm.action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Lift updater popups above DevTools instead of using their production portal layer. */
function SidebarFooterPreview() {
  const control = useUpdateControl()
  const trigger = (
    <span
      className="inline-flex"
      onClickCapture={(event) => {
        if (control.action !== "install") return
        event.stopPropagation()
        control.perform()
      }}
    >
      <UpdateStatusButton />
    </span>
  )

  return (
    <div className="px-1.5 py-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 min-w-0 flex-1 justify-start rounded-lg px-2 text-sm font-medium text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
        >
          <SettingsIcon className="size-3.5" />
          Settings
        </Button>
        {showsUpdateChangelog(control.state, control.action) ? (
          <HoverCard openDelay={200} closeDelay={120}>
            <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="end"
              sideOffset={8}
              className="flex w-72 flex-col gap-2.5 p-3"
              style={DEVTOOLS_LAYER}
            >
              <UpdateCardBody state={control.state} />
            </HoverCardContent>
          </HoverCard>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} style={DEVTOOLS_LAYER}>
              {describeUpdateTooltip(control.state, control.action)}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <RestartConfirmation confirmation={control.confirmation} />
    </div>
  )
}

function Inert(props: { className?: string; children: ReactNode }) {
  return (
    <div
      ref={(element) => {
        if (element) element.inert = true
      }}
      className={props.className}
    >
      {props.children}
    </div>
  )
}

function SidebarPlaceholderRows() {
  return (
    <div aria-hidden className="flex min-h-0 flex-1 flex-col gap-0.5 px-1.5 py-3">
      {["Photosynthesis notes", "Essay outline", "Chapter 4 flashcards"].map((title) => (
        <div key={title} className="truncate rounded-lg px-2 py-1.5 text-sm font-light text-text-weak">
          {title}
        </div>
      ))}
    </div>
  )
}

function ReadyToastStill() {
  return (
    <div className="flex w-[356px] items-start gap-2 rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-4 text-[13px] text-text-base shadow-md">
      <CircleCheckIcon className="mt-px size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">
          {language.t("updates.toast.downloadedTitle", { version: NEXT_VERSION })}
        </p>
        <p>{language.t("updates.toast.downloadedDescription")}</p>
      </div>
    </div>
  )
}

const APP_MENU_ROWS = [
  { id: "about", label: "About Buddy", tone: "normal" },
  { id: "updates", label: "Check for Updates...", tone: "active" },
  { id: "cli", label: "Install CLI...", tone: "disabled" },
  { id: "reload", label: "Reload", tone: "normal" },
  { id: "restart", label: "Restart", tone: "normal" },
  { id: "separator", label: "", tone: "separator" },
  { id: "quit", label: "Quit Buddy", tone: "normal" },
] as const

function AppMenuStill() {
  return (
    <div className="flex items-start gap-3">
      <div className={cn(HOVER_CARD_SURFACE, "w-52 p-1 text-[13px]")}>
        {APP_MENU_ROWS.map((row) =>
          row.tone === "separator" ? (
            <Separator key={row.id} className="my-1" />
          ) : (
            <div
              key={row.id}
              className={cn(
                "rounded-md px-2.5 py-1",
                row.tone === "active" && "bg-surface-interactive-weak text-text-strong",
                row.tone === "disabled" && "text-text-weaker",
              )}
            >
              {row.label}
            </div>
          ),
        )}
      </div>
      <p className="mt-7 max-w-40 text-xs text-text-weak">
        → opens Settings → About, then starts a check there
      </p>
    </div>
  )
}

function RestartConfirmationDemo() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Open the restart confirmation
      </Button>
      <RestartConfirmation
        confirmation={{
          open,
          version: NEXT_VERSION,
          onOpenChange: setOpen,
          onConfirm: () => undefined,
        }}
      />
    </>
  )
}

function SectionHeading(props: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold text-text-strong">{props.title}</h2>
      <p className="max-w-3xl text-xs text-text-weak">{props.description}</p>
    </div>
  )
}

function StateCaption(props: { preview: StatePreview; withNote?: boolean }) {
  const { state } = props.preview

  return (
    <figcaption className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs font-medium text-text-strong">
        {props.preview.label}
        <code className="font-mono text-[10px] font-normal text-text-weaker">
          {state.activity.status}
          {state.failure ? ` · failure: ${state.failure.stage}` : ""}
        </code>
      </span>
      {props.withNote ? (
        <span className="text-[11px] text-text-weaker">{props.preview.note}</span>
      ) : null}
    </figcaption>
  )
}

function ScriptControl<Value extends string>(props: {
  label: string
  value: Value
  options: { id: Value; label: string }[]
  onChange: (value: Value) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-weaker">{props.label}</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={props.value}
        onValueChange={(value) => {
          const next = findCatalogID(value, props.options)
          if (next) props.onChange(next)
        }}
      >
        {props.options.map((option) => (
          <ToggleGroupItem key={option.id} value={option.id} className="text-xs">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function Intro() {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-text-strong">Updater · every surface it added</h1>
      <p className="max-w-3xl text-sm text-text-weak">
        The main process owns one <code className="font-mono text-xs">UpdateState</code>. Every
        surface reads it through <code className="font-mono text-xs">useUpdateControl</code>, so all
        of them show the same step and do the same thing on press. A check never downloads: the user
        starts the download, and Buddy asks before it restarts.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {NEW_SURFACES.map((surface) => (
          <Badge key={surface} variant="outline">
            {surface}
          </Badge>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-weak">
        {FLOW_STEPS.map((step, index) => (
          <span key={step} className="flex items-center gap-2">
            {index > 0 ? <span className="text-text-weaker">→</span> : null}
            <span className="font-medium text-text-base">{step}</span>
          </span>
        ))}
      </p>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium text-text-weaker">Retired</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-text-weaker">
          {RETIRED_SURFACES.map((surface) => (
            <li key={surface} className="line-through decoration-text-weaker/60">
              {surface}
            </li>
          ))}
        </ul>
      </div>
    </header>
  )
}

function LiveFlow() {
  const [simulated] = useState(() => createSimulatedShell(DEFAULT_SCRIPT))
  const [script, setScript] = useState(DEFAULT_SCRIPT)

  const updateScript = (next: FlowScript) => {
    setScript(next)
    simulated.setScript(next)
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title="Live flow"
        description="One simulated shell behind both surfaces. Press the update button next to Settings to walk the flow, and hover it for its tooltip, or its release notes while an update waits to download. Settings follows the same store but is display-only here. The “ready” toast fires for real, in the app's bottom-right corner, under this panel."
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ScriptControl
          label="Next check"
          value={script.check}
          options={CHECK_RESULTS}
          onChange={(check) => updateScript({ ...script, check })}
        />
        <ScriptControl
          label="Download"
          value={script.download}
          options={DOWNLOAD_RESULTS}
          onChange={(download) => updateScript({ ...script, download })}
        />
        <ScriptControl
          label="Install"
          value={script.install}
          options={INSTALL_RESULTS}
          onChange={(install) => updateScript({ ...script, install })}
        />
        <Button type="button" size="sm" variant="outline" onClick={simulated.reset}>
          Reset to {CURRENT_VERSION}
        </Button>
      </div>
      <FakeShell shell={simulated.shell}>
        <div className="flex h-[540px] overflow-hidden rounded-xl border border-border-weaker-base bg-background-base">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border-weaker-base bg-surface-raised-base">
            <SidebarPlaceholderRows />
            <SidebarFooterPreview />
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto px-8 py-8">
            <Inert className="mx-auto max-w-3xl">
              <UpdatesSettingsSection />
            </Inert>
          </div>
        </div>
      </FakeShell>
    </section>
  )
}

function SidebarButtonGrid() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title="Sidebar update button · every state"
        description="New, next to Settings. The icon says what a press does: refresh checks, download downloads. Once an update is downloaded, the icon becomes an “Install” button. A dot means an update is waiting to download; red means a check or download failed. Hover any of them: release notes open in a card while an update waits to download; everything else, failures and Install included, shows a tooltip."
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-4 gap-y-6">
        {STATE_PREVIEWS.map((entry) => (
          <figure key={entry.id} className="flex flex-col gap-2">
            <StateCaption preview={entry} withNote />
            <div className="w-60 rounded-xl border border-border-weaker-base bg-surface-raised-base">
              <FakeShell shell={entry.shell}>
                <SidebarFooterPreview />
              </FakeShell>
            </div>
          </figure>
        ))}
      </div>
    </section>
  )
}

function HoverGrid() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title="Hover · every state"
        description="A hover card only while an update waits to download and nothing has failed, for its release notes: the status, then what a press will do, then what's new. Every other state, failures and the Install button included, gets a one-line tooltip: the failure or the status, then what a press will do."
      />
      <div className="flex flex-wrap items-start gap-x-4 gap-y-6">
        {STATE_PREVIEWS.filter((entry) => entry.state.activity.status !== "unsupported").map(
          (entry) => {
            const action = resolveUpdateAction(entry.state)
            return (
              <figure key={entry.id} className="flex flex-col gap-2">
                <StateCaption preview={entry} />
                {showsUpdateChangelog(entry.state, action) ? (
                  <HoverCardStill>
                    <UpdateCardBody state={entry.state} />
                  </HoverCardStill>
                ) : (
                  <TooltipStill>{describeUpdateTooltip(entry.state, action)}</TooltipStill>
                )}
              </figure>
            )
          },
        )}
      </div>
    </section>
  )
}

function SettingsGrid() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title="Settings → About → Updates · every state"
        description="The real section. The banner strip appears only when there is something to say, release notes sit under it while an update is on offer, and the manual check row now says when Buddy last checked."
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(460px,1fr))] gap-x-6 gap-y-8">
        {STATE_PREVIEWS.map((entry) => (
          <figure key={entry.id} className="flex min-w-0 flex-col gap-2">
            <StateCaption preview={entry} />
            <FakeShell shell={entry.shell}>
              <Inert>
                <UpdatesSettingsSection />
              </Inert>
            </FakeShell>
          </figure>
        ))}
      </div>
    </section>
  )
}

function Piece(props: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-xs font-medium text-text-strong">{props.title}</h3>
        <p className="max-w-sm text-[11px] text-text-weaker">{props.note}</p>
      </div>
      {props.children}
    </div>
  )
}

function Pieces() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title="Pieces"
        description="The parts that are not tied to one resting state."
      />
      <div className="flex flex-wrap items-start gap-x-10 gap-y-8">
        <Piece
          title="Release notes · the three link labels"
          note="Plain text parsed from the GitHub release, newest first, at most eight lines per release. Shared by the hover card and Settings."
        >
          <div className="flex flex-wrap items-start gap-4">
            {RELEASE_NOTE_VARIANTS.map((variant) => (
              <figure key={variant.id} className="flex flex-col gap-2">
                <figcaption className="text-[11px] text-text-weaker">{variant.label}</figcaption>
                <HoverCardStill>
                  <UpdateReleaseNotes notes={variant.notes} onOpenRelease={ignoreReleaseLink} />
                </HoverCardStill>
              </figure>
            ))}
          </div>
        </Piece>
        <Piece
          title="Restart confirmation"
          note="Every install press lands here first, from the sidebar or from Settings. It names what a restart stops."
        >
          <RestartConfirmationDemo />
        </Piece>
        <Piece
          title="“Ready” toast"
          note="Fires once per version when a download the user started finishes, and points back to the sidebar button."
        >
          <ReadyToastStill />
        </Piece>
        <Piece
          title="App menu · macOS"
          note="No more native dialogs. On Windows there is no app menu; the sidebar button and Settings are the way in."
        >
          <AppMenuStill />
        </Piece>
      </div>
    </section>
  )
}

export function UpdaterSurfacesEasel() {
  return (
    <div className="h-full min-h-0 w-full overflow-y-auto">
      <div className="flex flex-col gap-12 px-8 py-8">
        <Intro />
        <LiveFlow />
        <SidebarButtonGrid />
        <HoverGrid />
        <SettingsGrid />
        <Pieces />
      </div>
    </div>
  )
}
