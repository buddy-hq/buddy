import { useEffect, useState } from "react"
import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
} from "@buddy/ui"
import {
  describeBrowserImportReason,
  type BrowserImportFailureReason,
  type BrowserImportSource,
} from "@buddy/browser-contract/browser-import"
import type { InAppBrowserProfile } from "@buddy/browser-contract/profiles"
import { ArrowDownIcon, ArrowRightIcon, CheckIcon } from "@/icons/app-icons"
import type { BrowserImportTargetSelection } from "@/lib/browser-import-wizard"

export const BROWSER_IMPORT_TARGET_MISSING =
  "That profile is no longer available. Choose where to import these cookies."
const PROFILE_LIMIT_REACHED =
  "You've reached the profile limit. Choose an existing profile to import into."

function cookieCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "cookie" : "cookies"}`
}

export function QuitStep(props: { sourceName: string; onCancel: () => void; onQuit: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Quit {props.sourceName} to import</DialogTitle>
        <DialogDescription>
          {props.sourceName} is open, so its cookies can’t be read yet. Quit it, then continue.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button onClick={props.onQuit}>I’ve quit it</Button>
      </DialogFooter>
    </>
  )
}

export function FullDiskAccessStep(props: {
  sourceName: string
  stillRequired: boolean
  onCancel: () => void
  onOpenSettings: () => Promise<void>
  onCheck: () => Promise<boolean>
  onContinue: () => void
}) {
  const { onCheck } = props
  const [opening, setOpening] = useState(false)
  const [openingFailed, setOpeningFailed] = useState(false)
  const [granted, setGranted] = useState(false)

  useEffect(() => {
    let disposed = false
    let checking = false
    const check = () => {
      if (checking) return
      checking = true
      void onCheck()
        .then(
          (next) => {
            if (!disposed) setGranted(next)
          },
          () => {
            if (!disposed) setGranted(false)
          },
        )
        .finally(() => {
          checking = false
        })
    }
    check()
    const interval = window.setInterval(check, 1_000)
    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [onCheck])

  function openSettings() {
    if (opening) return
    setOpening(true)
    setOpeningFailed(false)
    void props
      .onOpenSettings()
      .catch(() => setOpeningFailed(true))
      .finally(() => setOpening(false))
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Let Buddy read {props.sourceName}’s cookies</DialogTitle>
        <DialogDescription>
          To import cookies from {props.sourceName}, Buddy needs Full Disk Access. Turn it on in
          System Settings, then come back to finish the import. You can revoke it again once the
          import is done.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Button variant="outline" disabled={opening} onClick={openSettings}>
          Open System Settings
        </Button>
        {openingFailed ? (
          <p role="status" className="text-xs text-text-weak">
            Could not open System Settings. Open Privacy & Security → Full Disk Access manually.
          </p>
        ) : null}
        <p className="text-xs text-text-weak">
          {props.stillRequired
            ? "Access is still required. Quit and reopen Buddy if you just allowed it, then continue."
            : "If access doesn't update after you allow it, quit and reopen Buddy, then continue."}
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button disabled={!granted || opening} onClick={props.onContinue}>
          Continue
        </Button>
      </DialogFooter>
    </>
  )
}

function SelectableTile(props: {
  selected: boolean
  title: string
  subtitle?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      onClick={props.onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-border-interactive-base",
        props.selected
          ? "border-border-interactive-base bg-surface-base-hover"
          : "border-border-base/60 hover:bg-surface-base-hover",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-text-strong">{props.title}</span>
        {props.subtitle ? (
          <span className="block truncate text-xs text-text-weaker">{props.subtitle}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full border",
          props.selected
            ? "border-border-interactive-base bg-icon-interactive-base text-surface-raised-base"
            : "border-border-base",
        )}
      >
        {props.selected ? <CheckIcon className="size-2.5" /> : null}
      </span>
    </button>
  )
}

function TileGroupLabel(props: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-text-weaker">{props.children}</p>
  )
}

export function ConfigureStep(props: {
  source: BrowserImportSource
  targetProfiles: readonly InAppBrowserProfile[]
  canCreateProfile: boolean
  sourceProfileID: string
  onSourceProfileChange: (profileID: string) => void
  target: BrowserImportTargetSelection
  targetError: string | undefined
  onTargetChange: (target: BrowserImportTargetSelection) => void
  onCancel: () => void
  onImport: () => void
}) {
  const { target } = props
  const targetMissing =
    target["_tag"] === "existing" &&
    !props.targetProfiles.some((profile) => profile.id === target.profileID)
  const targetUncreatable = target["_tag"] === "new" && !props.canCreateProfile
  const targetFeedback =
    props.targetError ??
    (targetMissing
      ? BROWSER_IMPORT_TARGET_MISSING
      : targetUncreatable
        ? PROFILE_LIMIT_REACHED
        : undefined)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import from {props.source.name}</DialogTitle>
        <DialogDescription>Choose which cookies to import.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <section className="flex-1 space-y-2">
          <TileGroupLabel>From</TileGroupLabel>
          {props.source.profiles.map((profile) => (
            <SelectableTile
              key={profile.id}
              selected={props.sourceProfileID === profile.id}
              title={profile.name}
              subtitle={
                profile.cookieCount === undefined
                  ? undefined
                  : `${profile.cookieCount.toLocaleString()} ${profile.cookieCount === 1 ? "cookie" : "cookies"}`
              }
              onSelect={() => props.onSourceProfileChange(profile.id)}
            />
          ))}
        </section>
        <div className="flex shrink-0 items-center justify-center text-icon-base">
          <ArrowDownIcon className="size-4 sm:hidden" />
          <ArrowRightIcon className="hidden size-4 sm:block" />
        </div>
        <section className="flex-1 space-y-2">
          <TileGroupLabel>Into</TileGroupLabel>
          {props.canCreateProfile ? (
            <SelectableTile
              selected={target["_tag"] === "new"}
              title="New profile"
              subtitle="Created for these cookies"
              onSelect={() => props.onTargetChange({ _tag: "new" })}
            />
          ) : null}
          {props.targetProfiles.map((profile) => (
            <SelectableTile
              key={profile.id}
              selected={target["_tag"] === "existing" && target.profileID === profile.id}
              title={profile.name}
              subtitle="Existing profile"
              onSelect={() => props.onTargetChange({ _tag: "existing", profileID: profile.id })}
            />
          ))}
        </section>
      </div>
      {targetFeedback ? (
        <p role="alert" className="text-sm text-icon-critical-base">
          {targetFeedback}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          disabled={props.sourceProfileID === "" || targetMissing || targetUncreatable}
          onClick={() => props.onImport()}
        >
          Import
        </Button>
      </DialogFooter>
    </>
  )
}

function ProgressStep(props: { title: string; description: string; label: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-3 py-6">
        <Spinner className="size-4 text-icon-base" />
        <span className="text-sm text-text-weak">{props.label}</span>
      </div>
    </>
  )
}

export function ImportingStep() {
  return (
    <ProgressStep
      title="Importing cookies"
      description="This may take a moment."
      label="Importing…"
    />
  )
}

export function CheckingStep(props: { sourceName: string; check: "browser" | "fullDiskAccess" }) {
  const fullDiskAccess = props.check === "fullDiskAccess"
  return (
    <ProgressStep
      title={`Checking ${props.sourceName}`}
      description={
        fullDiskAccess ? "Checking Full Disk Access." : "Checking whether the browser has closed."
      }
      label={fullDiskAccess ? "Checking access…" : "Checking…"}
    />
  )
}

export function DoneStep(props: {
  imported: number
  skipped: number
  skippedDomains: readonly string[]
  targetName: string
  onClose: () => void
}) {
  const { imported, skipped } = props
  const title =
    imported > 0
      ? `Imported ${cookieCount(imported)}`
      : skipped > 0
        ? `Skipped ${cookieCount(skipped)}`
        : "No cookies found"
  const description =
    imported > 0
      ? `Added to ${props.targetName}.${skipped > 0 ? ` ${cookieCount(skipped)} skipped.` : ""}`
      : skipped > 0
        ? "No cookies were imported."
        : "There were no cookies to import."
  const skippedSites =
    props.skippedDomains.length > 0 ? ` Skipped sites: ${props.skippedDomains.join(", ")}.` : ""
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description + skippedSites}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={props.onClose}>Done</Button>
      </DialogFooter>
    </>
  )
}

export function BlockedStep(props: {
  sourceName: string
  reason: BrowserImportFailureReason
  onClose: () => void
  onRetry: (() => void) | undefined
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Couldn’t import from {props.sourceName}</DialogTitle>
        <DialogDescription>{describeBrowserImportReason(props.reason)}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={props.onClose}>
          Close
        </Button>
        {props.onRetry ? <Button onClick={() => props.onRetry?.()}>Try again</Button> : null}
      </DialogFooter>
    </>
  )
}
