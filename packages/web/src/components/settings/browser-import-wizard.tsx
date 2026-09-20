import { useRef, useState } from "react"
import { Dialog, DialogContent } from "@buddy/ui"
import type { BrowserImportSource } from "@buddy/browser-contract/browser-import"
import {
  createInAppBrowserProfileID,
  type InAppBrowserProfile,
} from "@buddy/browser-contract/profiles"
import {
  browserImportOutcomeStep,
  canCloseBrowserImportWizard,
  fullDiskAccessRecheckStep,
  initialBrowserImportStep,
  initialBrowserImportTargetSelection,
  isRetryableBrowserImportReason,
  refreshedBrowserImportSourceProfileID,
  refreshedBrowserImportStep,
  resolveBrowserImportTarget,
  type BrowserImportOutcome,
  type BrowserImportTarget,
  type BrowserImportWizardStep,
} from "@/lib/browser-import-wizard"
import {
  BROWSER_IMPORT_TARGET_MISSING,
  BlockedStep,
  CheckingStep,
  ConfigureStep,
  DoneStep,
  FullDiskAccessStep,
  ImportingStep,
  QuitStep,
} from "./browser-import-wizard-steps"

export function BrowserImportWizard(props: {
  source: BrowserImportSource
  targetProfiles: readonly InAppBrowserProfile[]
  canCreateProfile: boolean
  onImport: (input: {
    sourceProfileID: string
    target: BrowserImportTarget
  }) => Promise<BrowserImportOutcome>
  onRefreshSource: () => Promise<BrowserImportSource | undefined>
  onOpenFullDiskAccessSettings: () => Promise<void>
  onCheckFullDiskAccess: () => Promise<boolean>
  onClose: () => void
}) {
  const [source, setSource] = useState(props.source)
  const [step, setStep] = useState(() => initialBrowserImportStep(props.source))
  const [sourceProfileID, setSourceProfileID] = useState(() => props.source.profiles[0]?.id ?? "")
  const [target, setTarget] = useState(() =>
    initialBrowserImportTargetSelection(props.canCreateProfile, props.targetProfiles),
  )
  const [targetError, setTargetError] = useState<string>()
  const newProfileIDRef = useRef(createInAppBrowserProfileID())
  const importInFlightRef = useRef(false)

  function runImportWithSourceProfileID(chosenSourceProfileID: string) {
    if (importInFlightRef.current) return
    const chosen = resolveBrowserImportTarget(target, newProfileIDRef.current, props.targetProfiles)
    if (!chosen) {
      setTargetError(BROWSER_IMPORT_TARGET_MISSING)
      setStep({ _tag: "configure" })
      return
    }
    setTargetError(undefined)
    importInFlightRef.current = true
    setStep({ _tag: "importing" })
    void props
      .onImport({ sourceProfileID: chosenSourceProfileID, target: chosen })
      .then(browserImportOutcomeStep, (error): BrowserImportWizardStep => {
        console.error("[browser-import] Import workflow failed", error)
        return { _tag: "blocked", reason: "readFailed" }
      })
      .then(setStep)
      .finally(() => {
        importInFlightRef.current = false
      })
  }

  function runImport() {
    runImportWithSourceProfileID(sourceProfileID)
  }

  function recheckSource(
    check: "browser" | "fullDiskAccess",
    nextStep: (refreshed: BrowserImportSource | undefined) => BrowserImportWizardStep,
  ) {
    setStep({ _tag: "checking", check })
    void props.onRefreshSource().then(
      (refreshed) => {
        if (refreshed) {
          setSource(refreshed)
          setSourceProfileID((current) => refreshedBrowserImportSourceProfileID(current, refreshed))
        }
        setStep(nextStep(refreshed))
      },
      (error) => {
        console.error("[browser-import] Browser source recheck failed", error)
        setStep({ _tag: "blocked", reason: "readFailed" })
      },
    )
  }

  function recheckFullDiskAccess(resume: "configure" | "import") {
    setStep({ _tag: "checking", check: "fullDiskAccess" })
    void props.onRefreshSource().then(
      (refreshed) => {
        const refreshedProfileID = refreshed
          ? refreshedBrowserImportSourceProfileID(sourceProfileID, refreshed)
          : sourceProfileID
        if (refreshed) {
          setSource(refreshed)
          setSourceProfileID(refreshedProfileID)
        }
        const next = fullDiskAccessRecheckStep(refreshed)
        if (resume === "import" && next["_tag"] === "configure") {
          runImportWithSourceProfileID(refreshedProfileID)
          return
        }
        setStep(next)
      },
      (error) => {
        console.error("[browser-import] Full Disk Access recheck failed", error)
        setStep({ _tag: "blocked", reason: "readFailed" })
      },
    )
  }

  function renderStep() {
    switch (step["_tag"]) {
      case "quit":
        return (
          <QuitStep
            sourceName={source.name}
            onCancel={props.onClose}
            onQuit={() => recheckSource("browser", refreshedBrowserImportStep)}
          />
        )
      case "fullDiskAccess":
        return (
          <FullDiskAccessStep
            sourceName={source.name}
            stillRequired={step.checked}
            onCancel={props.onClose}
            onOpenSettings={props.onOpenFullDiskAccessSettings}
            onCheck={props.onCheckFullDiskAccess}
            onContinue={() => recheckFullDiskAccess(step.resume)}
          />
        )
      case "checking":
        return <CheckingStep sourceName={source.name} check={step.check} />
      case "importing":
        return <ImportingStep />
      case "done":
        return (
          <DoneStep
            imported={step.imported}
            skipped={step.skipped}
            skippedDomains={step.skippedDomains}
            targetName={step.targetName}
            onClose={props.onClose}
          />
        )
      case "blocked":
        return (
          <BlockedStep
            sourceName={source.name}
            reason={step.reason}
            onClose={props.onClose}
            onRetry={isRetryableBrowserImportReason(step.reason) ? runImport : undefined}
          />
        )
      case "configure":
        return (
          <ConfigureStep
            source={source}
            targetProfiles={props.targetProfiles}
            canCreateProfile={props.canCreateProfile}
            sourceProfileID={sourceProfileID}
            onSourceProfileChange={setSourceProfileID}
            target={target}
            targetError={targetError}
            onTargetChange={(selection) => {
              setTarget(selection)
              setTargetError(undefined)
            }}
            onCancel={props.onClose}
            onImport={runImport}
          />
        )
    }
  }

  const canClose = canCloseBrowserImportWizard(step)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && canClose) props.onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={canClose}>
        {renderStep()}
      </DialogContent>
    </Dialog>
  )
}
