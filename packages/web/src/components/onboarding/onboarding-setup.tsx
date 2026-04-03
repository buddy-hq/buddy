import { Button, CheckIcon, FolderOpenIcon } from "@buddy/ui"
import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { resolveBuddyIconUrl } from "@/lib/static-asset"
import type { OnboardingAuthChoice } from "./types"

type OnboardingSetupProps = {
  authChoice?: OnboardingAuthChoice
  connectedAuthChoice?: OnboardingAuthChoice
  busyChoice?: OnboardingAuthChoice
  folderBusy: boolean
  defaultHomeDirectory?: string
  error?: string
  onChoose: (choice: OnboardingAuthChoice) => void
  onUseDefaultHome: () => void
  onPickFolder: () => void
  onCancelAuth?: () => void
}

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z" />
    </svg>
  )
}

export function OnboardingSetup(props: OnboardingSetupProps) {
  const buddyIconUrl = resolveBuddyIconUrl()

  const content = {
    header: {
      title: language.t("onboardingSetup.header.title"),
      badge: language.t("onboardingSetup.header.badge"),
      subtitle: language.t("onboardingSetup.header.subtitle"),
      logoAlt: language.t("onboardingSetup.header.logoAlt"),
    },
    engineSelection: {
      heading: language.t("onboardingSetup.engineSelection.heading"),
      connected: language.t("onboardingSetup.engineSelection.connected"),
      chatGpt: {
        title: language.t("onboardingSetup.engineSelection.chatGpt.title"),
        description: language.t("onboardingSetup.engineSelection.chatGpt.description"),
      },
      freeModels: {
        title: language.t("onboardingSetup.engineSelection.freeModels.title"),
        description: language.t("onboardingSetup.engineSelection.freeModels.description"),
      },
    },
    notebookSelection: {
      heading: language.t("onboardingSetup.notebookSelection.heading"),
      defaultPathLabel: language.t("onboardingSetup.notebookSelection.defaultPathLabel"),
      buttonUseDefaultIdle: language.t("onboardingSetup.notebookSelection.buttonUseDefaultIdle"),
      buttonUseDefaultBusy: language.t("onboardingSetup.notebookSelection.buttonUseDefaultBusy"),
      buttonPickFolderIdle: language.t("onboardingSetup.notebookSelection.buttonPickFolderIdle"),
      buttonPickFolderBusy: language.t("onboardingSetup.notebookSelection.buttonPickFolderBusy"),
      note: language.t("onboardingSetup.notebookSelection.note"),
    },
    chatGptModal: {
      title: language.t("onboardingSetup.chatGptModal.title"),
      description: language.t("onboardingSetup.chatGptModal.description"),
      waitingLabel: language.t("onboardingSetup.chatGptModal.waitingLabel"),
      cancelButton: language.t("onboardingSetup.chatGptModal.cancelButton"),
    },
  }
  const hasProvider = Boolean(props.authChoice)
  const isChatGptConnected = props.connectedAuthChoice === "chatgpt_plus"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background-base px-6 py-20 text-text-base">
      {props.busyChoice === "chatgpt_plus" && (
        <div
          data-component="onboarding-auth-modal"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-sm animate-in fade-in duration-300"
        >
          <div className="flex w-full max-w-sm flex-col items-center text-center bg-surface-base border border-border-base p-8 rounded-3xl shadow-xl">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 mb-6 border border-emerald-500/20">
              <OpenAIIcon className="size-6 text-emerald-500 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-text-strong">
              {content.chatGptModal.title}
            </h3>
            <p className="mt-2 text-[14px] font-medium text-text-weak leading-relaxed">
              {content.chatGptModal.description}
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 rounded-full bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-emerald-500 border border-emerald-500/20">
              <svg className="size-4 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
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
              {content.chatGptModal.waitingLabel}
            </div>
            <Button
              data-action="onboarding-cancel-auth"
              variant="outline"
              className="mt-8 w-full rounded-xl hover:bg-surface-raised-base hover:text-text-strong transition-all"
              onClick={props.onCancelAuth}
            >
              {content.chatGptModal.cancelButton}
            </Button>
          </div>
        </div>
      )}

      <div data-component="onboarding-setup" className="flex w-full max-w-[440px] flex-col gap-12">
        <div className="mb-4 flex items-center gap-6 text-left">
          <img
            src={buddyIconUrl}
            alt={content.header.logoAlt}
            className="size-[64px] shrink-0 rounded-2xl opacity-90 shadow-[0_2px_10px_0_rgba(0,0,0,0.05)] [mix-blend-mode:var(--text-mix-blend-mode)]"
          />
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-bold tracking-tight text-text-strong leading-none">
                {content.header.title}
              </h1>
              <span className="translate-y-[-2px] rounded-lg border border-border-base bg-surface-raised-base px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-text-weaker shadow-sm">
                {content.header.badge}
              </span>
            </div>
            <p className="mt-3 text-[15px] font-medium text-text-weak leading-tight">
              {content.header.subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-end mb-2">
            <h2 className="text-sm font-medium text-text-weaker">
              {content.engineSelection.heading}
            </h2>
            {props.error && !hasProvider && (
              <span className="text-sm font-medium text-text-critical-base animate-in fade-in">
                {props.error}
              </span>
            )}
          </div>

          <div className="space-y-4">
            <button
              type="button"
              data-action="onboarding-select-chatgpt-plus"
              onClick={() => props.onChoose("chatgpt_plus")}
              disabled={Boolean(props.busyChoice)}
              className={cn(
                "group relative flex w-full items-center gap-6 rounded-2xl border p-5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-interactive-base focus-visible:ring-offset-2",
                props.authChoice === "chatgpt_plus"
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : isChatGptConnected
                    ? "border-border-success-base bg-surface-success-base/10"
                    : "border-border-base bg-surface-raised-base hover:border-border-interactive-base hover:bg-surface-raised-base-hover",
                props.busyChoice === "chatgpt_plus" &&
                  "animate-pulse opacity-70 pointer-events-none",
                props.busyChoice &&
                  props.busyChoice !== "chatgpt_plus" &&
                  "opacity-40 grayscale-[0.5] pointer-events-none",
              )}
            >
              <OpenAIIcon className="size-5 shrink-0 text-emerald-500" />
              <div className="flex-1">
                <p className="text-[15px] font-medium text-text-strong">
                  {content.engineSelection.chatGpt.title}
                </p>
                <p className="text-[13px] text-text-weak mt-0.5">
                  {content.engineSelection.chatGpt.description}
                </p>
              </div>
              {isChatGptConnected ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border-success-base bg-surface-success-base/10 px-2 py-0.5 text-[11px] font-medium text-text-success-base">
                  <CheckIcon className="size-3.5" />
                  {content.engineSelection.connected}
                </span>
              ) : null}
            </button>

            {!isChatGptConnected ? (
              <button
                type="button"
                data-action="onboarding-select-free-models"
                onClick={() => props.onChoose("free_models")}
                disabled={Boolean(props.busyChoice)}
                className={cn(
                  "group relative flex w-full items-center gap-6 rounded-2xl border p-5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-interactive-base focus-visible:ring-offset-2",
                  props.authChoice === "free_models"
                    ? "border-border-interactive-base bg-surface-interactive-base/10"
                    : "border-border-base bg-surface-raised-base hover:border-border-interactive-base hover:bg-surface-raised-base-hover",
                  props.busyChoice === "free_models" &&
                    "animate-pulse opacity-70 pointer-events-none",
                  props.busyChoice &&
                    props.busyChoice !== "free_models" &&
                    "opacity-40 grayscale-[0.5] pointer-events-none",
                )}
              >
                <div className="flex-1">
                  <p className="text-[15px] font-medium text-text-strong">
                    {content.engineSelection.freeModels.title}
                  </p>
                  <p className="text-[13px] text-text-weak mt-0.5">
                    {content.engineSelection.freeModels.description}
                  </p>
                </div>
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "space-y-5 transition-all duration-300 mt-2",
            hasProvider && !props.busyChoice
              ? "opacity-100"
              : "pointer-events-none opacity-40 grayscale-[0.2]",
          )}
        >
          <div className="flex justify-between items-end mb-2">
            <h2 className="text-sm font-medium text-text-weaker">
              {content.notebookSelection.heading}
            </h2>
            {props.error && hasProvider && (
              <span className="text-sm font-medium text-text-critical-base animate-in fade-in">
                {props.error}
              </span>
            )}
          </div>

          <Button
            type="button"
            data-action="onboarding-use-default-home"
            onClick={props.onUseDefaultHome}
            disabled={props.folderBusy || !hasProvider}
            size="lg"
            className="w-full h-16 rounded-2xl px-4 text-[16px]"
          >
            {props.folderBusy ? (
              <span className="animate-pulse font-medium">
                {content.notebookSelection.buttonUseDefaultBusy}
              </span>
            ) : (
              <div className="flex w-full items-center gap-3">
                <FolderOpenIcon className="size-5 shrink-0" />
                <span className="font-medium">
                  {content.notebookSelection.buttonUseDefaultIdle}
                </span>
              </div>
            )}
          </Button>

          {props.defaultHomeDirectory ? (
            <p className="text-xs text-text-weak">
              {content.notebookSelection.defaultPathLabel}: {props.defaultHomeDirectory}
            </p>
          ) : null}

          <Button
            type="button"
            data-action="onboarding-pick-folder"
            variant="outline"
            onClick={props.onPickFolder}
            disabled={props.folderBusy || !hasProvider}
            size="lg"
            className="w-full h-12 rounded-2xl px-4 text-[15px]"
          >
            {props.folderBusy
              ? content.notebookSelection.buttonPickFolderBusy
              : content.notebookSelection.buttonPickFolderIdle}
          </Button>
          <p className="text-xs text-text-weak">{content.notebookSelection.note}</p>
        </div>
      </div>
    </div>
  )
}
