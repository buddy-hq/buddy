import { CheckIcon, cn } from "@buddy/ui"
import { BookOpenTextIcon, SchoolIcon } from "@/icons/app-icons"
import { motion, useReducedMotion } from "motion/react"
import { language } from "@/context/language"
import type { PrimaryUse } from "@/state/project-config-readers"

const EASE_OUT = [0.23, 1, 0.32, 1] as const

type PrimaryUseSelectionProps = {
  busy?: boolean
  error?: string
  currentStep: number
  totalSteps: number
  value?: PrimaryUse
  onSelect: (primaryUse: PrimaryUse) => void
}

type PrimaryUseOption = {
  primaryUse: PrimaryUse
  title: string
  description: string
  Icon: typeof BookOpenTextIcon
}

export function PrimaryUseSelection(props: PrimaryUseSelectionProps) {
  const reducedMotion = useReducedMotion() === true
  const options: readonly PrimaryUseOption[] = [
    {
      primaryUse: "learn",
      title: language.t("onboardingPrimaryUse.learn.title"),
      description: language.t("onboardingPrimaryUse.learn.description"),
      Icon: BookOpenTextIcon,
    },
    {
      primaryUse: "teach",
      title: language.t("onboardingPrimaryUse.teach.title"),
      description: language.t("onboardingPrimaryUse.teach.description"),
      Icon: SchoolIcon,
    },
  ]

  return (
    <motion.section
      aria-labelledby="onboarding-primary-use-title"
      data-component="onboarding-primary-use"
      initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="flex w-full flex-col gap-6"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-text-weaker">
            {language.t("onboardingPrimaryUse.eyebrow")}
          </p>
          <span className="text-xs font-medium text-text-weaker">
            {props.currentStep} / {props.totalSteps}
          </span>
        </div>
        <h2 id="onboarding-primary-use-title" className="text-2xl font-semibold tracking-tight">
          {language.t("onboardingPrimaryUse.title")}
        </h2>
        <p className="text-sm leading-relaxed text-text-weak">
          {language.t("onboardingPrimaryUse.description")}
        </p>
      </div>

      <div className="grid gap-3">
        {options.map((option) => {
          const selected = props.value === option.primaryUse
          const Icon = option.Icon
          return (
            <button
              key={option.primaryUse}
              type="button"
              data-action="onboarding-select-primary-use"
              data-primary-use={option.primaryUse}
              aria-pressed={selected}
              disabled={props.busy}
              onClick={() => props.onSelect(option.primaryUse)}
              className={cn(
                "group relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left outline-none transition-[border-color,background-color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-border-interactive-base focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70",
                selected
                  ? "border-border-interactive-base bg-surface-interactive-weak"
                  : "border-border-base bg-surface-raised-base hover:border-border-interactive-base hover:bg-surface-raised-base-hover",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                  selected
                    ? "border-border-interactive-base/40 bg-surface-interactive-base text-text-on-interactive-base"
                    : "border-border-weaker-base bg-surface-base text-icon-base group-hover:text-icon-interactive-base",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-strong">{option.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-text-weak">
                  {option.description}
                </span>
              </span>
              {selected ? <CheckIcon className="size-4 text-icon-interactive-base" /> : null}
            </button>
          )
        })}
      </div>

      {props.error ? (
        <p
          role="alert"
          className="rounded-xl border-l-2 border-l-border-critical-base bg-surface-critical-weak px-3 py-2.5 text-sm font-medium text-icon-critical-base"
        >
          {props.error}
        </p>
      ) : null}

      <p className="text-center text-xs text-text-weaker">
        {language.t("onboardingPrimaryUse.changeLater")}
      </p>
    </motion.section>
  )
}
