import { Button, Input } from "@buddy/ui"
import { FolderOpenIcon } from "@buddy/ui"
import { OnboardingShell } from "./onboarding-shell"

type OnboardingFolderStepProps = {
  directory: string
  onDirectoryChange: (directory: string) => void
  onPickFolder: () => void
  onContinue: () => void
  onBack?: () => void
  continueLabel?: string
  pickLabel?: string
  canContinue?: boolean
  busy?: boolean
  error?: string
  className?: string
}

export function OnboardingFolderStep(props: OnboardingFolderStepProps) {
  return (
    <OnboardingShell
      eyebrow="Notebook"
      title={
        <>
          Choose the folder
          <br />
          Buddy should open.
        </>
      }
      description="Point Buddy at one notebook to finish setup. You can add more later from the app."
      className={props.className}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {props.onBack ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={props.onBack}
                disabled={props.busy}
              >
                Back
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            size="lg"
            onClick={props.onContinue}
            disabled={props.busy || !props.canContinue}
            className="sm:min-w-44"
          >
            {props.continueLabel ?? "Open Buddy"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-[24px] border border-white/10 bg-black/18 p-5">
          <p className="text-sm font-medium text-white">Notebook folder</p>
          <p className="mt-1 text-sm leading-6 text-white/68">
            Choose a local project directory. Buddy will use it as the first workspace.
          </p>
        </div>
        <div className="space-y-3">
          <label className="text-xs font-medium uppercase tracking-[0.22em] text-white/46">
            Folder path
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={props.directory}
              onChange={(event) => props.onDirectoryChange(event.target.value)}
              placeholder="/path/to/notebook"
              className="h-11 border-white/12 bg-white/6 text-white placeholder:text-white/34"
              disabled={props.busy}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={props.onPickFolder}
              disabled={props.busy}
              className="sm:min-w-40"
            >
              <FolderOpenIcon className="size-4" />
              {props.pickLabel ?? "Pick folder"}
            </Button>
          </div>
          {props.error ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {props.error}
            </div>
          ) : null}
          <p className="text-xs leading-5 text-white/46">
            Use the folder picker or paste a path manually. This step does not commit anything until
            you continue.
          </p>
        </div>
      </div>
    </OnboardingShell>
  )
}
