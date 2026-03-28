import { Button } from "@buddy/ui"
import { OnboardingShell } from "./onboarding-shell"

type OnboardingSplashStepProps = {
  onContinue: () => void
  continueLabel?: string
  className?: string
}

export function OnboardingSplashStep(props: OnboardingSplashStepProps) {
  return (
    <OnboardingShell
      eyebrow="First launch"
      title={
        <>
          Learn fast.
          <br />
          Stay in control.
        </>
      }
      description="Buddy opens with a short setup flow so you can choose your account path, then jump straight into a notebook."
      className={props.className}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-white/48">
            Everything stays local to this Mac until you choose a notebook and sign in.
          </p>
          <Button type="button" size="lg" onClick={props.onContinue} className="sm:min-w-44">
            {props.continueLabel ?? "Start setup"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4 rounded-[28px] border border-white/10 bg-gradient-to-br from-white/12 to-white/5 p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Buddy desktop</p>
            <p className="max-w-sm text-sm leading-6 text-white/76">
              A focused workspace for notebook-driven learning, with update support and optional
              local math tooling.
            </p>
          </div>
          <div className="hidden rounded-2xl border border-white/10 bg-black/20 p-3 sm:block">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-300" />
              <span className="text-xs text-white/60">Ready for first run</span>
            </div>
          </div>
        </div>
        <div className="grid gap-3 text-sm text-white/68 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
            <p className="font-medium text-white">ChatGPT Plus</p>
            <p className="mt-1 leading-6">
              Use the existing OpenAI auth flow from settings, then continue with your notebook.
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
            <p className="font-medium text-white">Free models</p>
            <p className="mt-1 leading-6">Start immediately without connecting anything extra.</p>
          </div>
        </div>
      </div>
    </OnboardingShell>
  )
}
