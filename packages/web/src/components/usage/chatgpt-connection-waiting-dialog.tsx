import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@buddy/ui"
import { ProviderIcon } from "@/components/provider-icon"
import { language } from "@/context/language"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"

export function ChatGptConnectionWaitingDialog(props: { open: boolean; onCancel: () => void }) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel()
      }}
    >
      <DialogContent className="max-w-sm border-border-base bg-surface-base p-8 text-center">
        <div className="flex flex-col items-center">
          <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base bg-surface-success-base/10">
            <ProviderIcon
              id={OPENAI_PROVIDER_ID}
              className="size-6 animate-pulse text-text-success-base"
            />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-text-strong">
            {language.t("onboardingSetup.chatGptModal.title")}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-text-weak">
            {language.t("onboardingSetup.chatGptModal.description")}
          </DialogDescription>
          <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base bg-surface-success-base/10 px-4 py-2 text-[13px] font-semibold text-text-success-base">
            <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            {language.t("onboardingSetup.chatGptModal.waitingLabel")}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-8 w-full rounded-xl"
            onClick={props.onCancel}
          >
            {language.t("onboardingSetup.chatGptModal.cancelButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
