import { Button } from "@buddy/ui"
import { OnboardingShell } from "./onboarding-shell"
import type { OnboardingAuthChoice } from "./types"

type AuthChoiceCardProps = {
  title: string
  description: string
  actionLabel: string
  onClick: () => void
  tone?: "default" | "outline"
  busy?: boolean
}

function AuthChoiceCard(props: AuthChoiceCardProps) {
  return (
    <div className="flex min-h-0 flex-col rounded-[24px] border border-white/10 bg-black/20 p-5 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-white">{props.title}</h3>
        <p className="text-sm leading-6 text-white/70">{props.description}</p>
      </div>
      <div className="mt-5">
        <Button
          type="button"
          size="lg"
          variant={props.tone === "outline" ? "outline" : "default"}
          className="w-full justify-center"
          onClick={props.onClick}
          disabled={props.busy}
        >
          {props.actionLabel}
        </Button>
      </div>
    </div>
  )
}

type OnboardingAuthChoiceStepProps = {
  onChoose: (choice: OnboardingAuthChoice) => void
  busyChoice?: OnboardingAuthChoice
  error?: string
  className?: string
}

export function OnboardingAuthChoiceStep(props: OnboardingAuthChoiceStepProps) {
  return (
    <OnboardingShell
      eyebrow="Account path"
      title={
        <>
          Pick how you want
          <br />
          to start Buddy.
        </>
      }
      description="You can connect your ChatGPT Plus account now, or skip sign-in and test Buddy with free models first."
      className={props.className}
      footer={
        <p className="text-xs leading-5 text-white/46">
          You can change provider connections later from settings. This step only chooses the first
          path.
        </p>
      }
    >
      <div className="space-y-4">
        {props.error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {props.error}
          </div>
        ) : null}
        <AuthChoiceCard
          title="Log in with ChatGPT Plus"
          description="Open the same ChatGPT auth flow you already use in settings."
          actionLabel="Log in with ChatGPT Plus"
          onClick={() => props.onChoose("chatgpt_plus")}
          busy={Boolean(props.busyChoice)}
        />
        <AuthChoiceCard
          title="Test with free models"
          description="Skip sign-in and move on with a free-model setup."
          actionLabel="Test with free models"
          onClick={() => props.onChoose("free_models")}
          tone="outline"
          busy={Boolean(props.busyChoice)}
        />
      </div>
    </OnboardingShell>
  )
}
