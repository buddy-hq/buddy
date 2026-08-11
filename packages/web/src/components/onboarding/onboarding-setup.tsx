import { Button, CheckIcon, Z_INDEX, cn } from "@buddy/ui"
import { FolderIcon } from "@/icons/app-icons"
import { motion, AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { resolveBuddyIconUrl } from "@/lib/static-asset"
import type { OnboardingAuthChoice } from "./types"

type OnboardingSetupProps = {
  authChoice?: OnboardingAuthChoice
  connectedAuthChoice?: OnboardingAuthChoice
  busyChoice?: OnboardingAuthChoice
  folderBusy: boolean
  documentsAccessGranted: boolean
  showFolderRecovery: boolean
  stepOffset?: number
  defaultHomeDirectory?: string
  error?: string
  onChoose: (choice: OnboardingAuthChoice) => void
  onUseDefaultHome: () => void
  onPickFolder: () => void
  onCancelAuth?: () => void
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const
const STAGGER_DELAY_MS = 60
const STAGGER_DELAY_S = STAGGER_DELAY_MS / 1000

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z" />
    </svg>
  )
}

export function StaggerItem({
  index,
  children,
  className,
}: {
  index: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: EASE_OUT,
        delay: index * STAGGER_DELAY_S,
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function PulsingRing({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="12 20"
        className="origin-center animate-spin"
        style={{ animationDuration: "1.2s" }}
      />
    </svg>
  )
}

/** Numbered step indicator dot for the vertical stepper. */
function StepDot({ step, isActive }: { step: number; isActive: boolean }) {
  return (
    <div
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-150",
        isActive
          ? "bg-surface-interactive-base text-text-on-interactive-base"
          : "bg-surface-raised-base text-text-weaker border border-border-base",
      )}
    >
      {step}
    </div>
  )
}

export function OnboardingHeader() {
  const buddyIconUrl = resolveBuddyIconUrl()
  const content = {
    header: {
      title: language.t("onboardingSetup.header.title"),
      badge: language.t("onboardingSetup.header.badge"),
      subtitle: language.t("onboardingSetup.header.subtitle"),
      logoAlt: language.t("onboardingSetup.header.logoAlt"),
    },
  }

  return (
    <div className="flex items-center gap-6 text-left mb-4">
      <StaggerItem index={0}>
        <img
          src={buddyIconUrl}
          alt={content.header.logoAlt}
          className="size-16 shrink-0 rounded-2xl opacity-90 shadow-[0_2px_10px_0_rgba(0,0,0,0.05)] [mix-blend-mode:var(--text-mix-blend-mode)]"
        />
      </StaggerItem>
      <StaggerItem index={1} className="flex flex-col justify-center">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-bold leading-none tracking-tight text-text-strong">
            {content.header.title}
          </h1>
          <span className="translate-y-[-2px] rounded-lg border border-border-base bg-surface-raised-base px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-text-weaker shadow-sm">
            {content.header.badge}
          </span>
        </div>
        <p className="mt-3 text-sm font-medium leading-tight text-text-weak">
          {content.header.subtitle}
        </p>
      </StaggerItem>
    </div>
  )
}

export function OnboardingSetup(props: OnboardingSetupProps) {
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
      recoveryHeading: language.t("onboardingSetup.notebookSelection.recoveryHeading"),
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
    storageSetup: {
      heading: language.t("onboardingSetup.storageSetup.heading"),
      locationLabel: language.t("onboardingSetup.storageSetup.locationLabel"),
      buttonContinue: language.t("onboardingSetup.storageSetup.buttonContinue"),
      buttonContinueBusy: language.t("onboardingSetup.storageSetup.buttonContinueBusy"),
    },
  }
  const hasProvider = Boolean(props.authChoice)
  const stepOffset = props.stepOffset ?? 0
  const isChatGptConnected = props.connectedAuthChoice === "chatgpt_plus"
  const showProviderError = props.error && !props.showFolderRecovery
  const showRecoveryError = props.error && props.showFolderRecovery && hasProvider

  return (
    <>
      {/* OAuth Auth Modal */}
      <AnimatePresence>
        {props.busyChoice === "chatgpt_plus" ? (
          <motion.div
            data-component="onboarding-auth-modal"
            role="dialog"
            aria-modal="true"
            aria-label={content.chatGptModal.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="fixed inset-0 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-md"
            style={{ zIndex: Z_INDEX.modal }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-border-base bg-surface-base p-8 text-center shadow-lg"
            >
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base/30 bg-surface-success-weak">
                <OpenAIIcon className="size-6 text-icon-success-base" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-text-strong">
                {content.chatGptModal.title}
              </h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-text-weak">
                {content.chatGptModal.description}
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base/30 bg-surface-success-weak px-4 py-2 text-xs font-semibold text-text-on-success-weak">
                <PulsingRing />
                {content.chatGptModal.waitingLabel}
              </div>
              <Button
                data-action="onboarding-cancel-auth"
                variant="outline"
                className="mt-8 w-full rounded-xl"
                onClick={props.onCancelAuth}
              >
                {content.chatGptModal.cancelButton}
              </Button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div data-component="onboarding-setup" className="flex w-full flex-col gap-8">
        {/* ── Vertical Stepper ── */}
        <div className="flex flex-col">
          {/* Step 1: Engine Selection */}
          <StaggerItem index={2} className="flex gap-5">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <StepDot step={1 + stepOffset} isActive />
              <div className="mt-2 w-px flex-1 bg-border-base" />
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col gap-3 pb-8">
              <h2 className="text-sm font-medium text-text-weaker">
                {content.engineSelection.heading}
              </h2>

              {/* Provider Error */}
              <AnimatePresence>
                {showProviderError ? (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                  >
                    <div className="rounded-xl border-l-2 border-l-border-critical-base bg-surface-critical-weak px-3 py-2.5">
                      <p className="text-sm font-medium text-icon-critical-base">{props.error}</p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="flex flex-col gap-3">
                {/* ChatGPT Plus Card */}
                <button
                  type="button"
                  data-action="onboarding-select-chatgpt-plus"
                  aria-pressed={props.authChoice === "chatgpt_plus"}
                  onClick={() => props.onChoose("chatgpt_plus")}
                  disabled={Boolean(props.busyChoice)}
                  className={cn(
                    "group relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left outline-none transition-[border-color,background-color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-border-interactive-base focus-visible:ring-offset-2 active:scale-[0.98]",
                    props.authChoice === "chatgpt_plus"
                      ? "border-border-success-base bg-surface-success-weak"
                      : isChatGptConnected
                        ? "border-border-success-base/50 bg-surface-success-weak/50"
                        : "border-border-base bg-surface-raised-base hover:border-border-interactive-base hover:bg-surface-raised-base-hover",
                    props.busyChoice === "chatgpt_plus" && "pointer-events-none opacity-70",
                    props.busyChoice &&
                      props.busyChoice !== "chatgpt_plus" &&
                      "pointer-events-none opacity-50",
                  )}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-success-base/20 bg-surface-success-weak">
                    <OpenAIIcon className="size-4 text-icon-success-base" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-strong">
                      {content.engineSelection.chatGpt.title}
                    </p>
                    <p className="mt-0.5 text-xs text-text-weak">
                      {content.engineSelection.chatGpt.description}
                    </p>
                  </div>
                  <AnimatePresence>
                    {isChatGptConnected ? (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, ease: EASE_OUT }}
                        className="inline-flex items-center gap-1 rounded-full border border-border-success-base bg-surface-success-weak px-2.5 py-1 text-[11px] font-medium text-text-on-success-weak"
                      >
                        <CheckIcon className="size-3.5" />
                        {content.engineSelection.connected}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  {props.busyChoice === "chatgpt_plus" ? (
                    <PulsingRing className="text-icon-success-base" />
                  ) : null}
                </button>

                {/* Free Models Card */}
                <AnimatePresence>
                  {!isChatGptConnected ? (
                    <motion.div
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.25, ease: EASE_OUT }}
                    >
                      <button
                        type="button"
                        data-action="onboarding-select-free-models"
                        aria-pressed={props.authChoice === "free_models"}
                        onClick={() => props.onChoose("free_models")}
                        disabled={Boolean(props.busyChoice)}
                        className={cn(
                          "group relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left outline-none transition-[border-color,background-color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-border-interactive-base focus-visible:ring-offset-2 active:scale-[0.98]",
                          props.authChoice === "free_models"
                            ? "border-border-interactive-base bg-surface-interactive-weak"
                            : "border-border-base bg-surface-raised-base hover:border-border-interactive-base hover:bg-surface-raised-base-hover",
                          props.busyChoice === "free_models" && "pointer-events-none opacity-70",
                          props.busyChoice &&
                            props.busyChoice !== "free_models" &&
                            "pointer-events-none opacity-50",
                        )}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-base bg-surface-raised-base">
                          <svg
                            className="size-4 text-icon-base"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-strong">
                            {content.engineSelection.freeModels.title}
                          </p>
                          <p className="mt-0.5 text-xs text-text-weak">
                            {content.engineSelection.freeModels.description}
                          </p>
                        </div>
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </StaggerItem>

          {/* Step 2: Local Storage Setup */}
          <StaggerItem index={3} className="flex gap-5">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <StepDot step={2 + stepOffset} isActive={hasProvider} />
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col gap-3">
              <AnimatePresence mode="wait">
                {props.showFolderRecovery ? (
                  /* ── Folder Recovery ── */
                  <motion.div
                    key="recovery"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    className="flex flex-col gap-3"
                  >
                    <h2 className="text-sm font-medium text-text-weaker">
                      {content.notebookSelection.recoveryHeading}
                    </h2>

                    <AnimatePresence>
                      {showRecoveryError ? (
                        <motion.div
                          role="alert"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: EASE_OUT }}
                        >
                          <div className="rounded-xl border-l-2 border-l-border-critical-base bg-surface-critical-weak px-3 py-2.5">
                            <p className="text-sm font-medium text-icon-critical-base">
                              {props.error}
                            </p>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <Button
                      type="button"
                      data-action="onboarding-pick-folder"
                      variant="outline"
                      onClick={props.onPickFolder}
                      disabled={props.folderBusy || !hasProvider}
                      size="lg"
                      className="h-14 w-full rounded-2xl px-4 text-sm"
                    >
                      {props.folderBusy
                        ? content.notebookSelection.buttonPickFolderBusy
                        : content.notebookSelection.buttonPickFolderIdle}
                    </Button>
                    {props.defaultHomeDirectory ? (
                      <p className="text-xs text-text-weaker">
                        {content.notebookSelection.defaultPathLabel}: {props.defaultHomeDirectory}
                      </p>
                    ) : null}
                    <p className="text-xs text-text-weaker">{content.notebookSelection.note}</p>
                  </motion.div>
                ) : (
                  /* ── Default Storage ── */
                  <motion.div
                    key="default-storage"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    className="flex flex-col gap-3"
                  >
                    <h2 className="text-sm font-medium text-text-weaker">
                      {content.storageSetup.heading}
                    </h2>

                    <div className="flex items-center gap-4 rounded-2xl border border-border-base bg-surface-raised-base p-4">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-base bg-surface-base">
                        <FolderIcon className="size-4 text-icon-base" />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <p className="text-sm font-medium text-text-strong">
                          {content.storageSetup.locationLabel}
                        </p>
                        {props.documentsAccessGranted ? (
                          <CheckIcon className="size-4 shrink-0 text-icon-success-base" />
                        ) : null}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </StaggerItem>
        </div>

        {/* ── Primary CTA ── */}
        <StaggerItem index={4}>
          <AnimatePresence mode="wait">
            {!props.showFolderRecovery ? (
              <motion.div
                key="default-cta"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                <Button
                  type="button"
                  data-action="onboarding-use-default-home"
                  onClick={props.onUseDefaultHome}
                  disabled={props.folderBusy || !hasProvider}
                  size="lg"
                  className="h-12 w-full rounded-2xl text-sm"
                >
                  {props.folderBusy
                    ? content.storageSetup.buttonContinueBusy
                    : content.storageSetup.buttonContinue}
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </StaggerItem>
      </div>
    </>
  )
}
