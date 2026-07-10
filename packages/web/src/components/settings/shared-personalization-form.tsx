import { cn, Input, Textarea } from "@buddy/ui"
import { BookOpenTextIcon, SchoolIcon } from "lucide-react"
import { motion } from "motion/react"
import { language } from "@/context/language"
import type { AnyFieldApi } from "@tanstack/react-form"
import type { PersonalizationSettings } from "@/state/project-config-readers"

const EASE_OUT = [0.23, 1, 0.32, 1] as const

export function PersonalizationFormField({
  index,
  label,
  children,
}: {
  index: number
  label: string
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: index * 0.06 }}
      className="flex flex-col gap-2"
    >
      <p className="text-sm font-medium text-text-weaker">{label}</p>
      {children}
    </motion.div>
  )
}

type PersonalizationFormApi = {
  Field: (props: {
    name: keyof PersonalizationSettings
    children: (field: AnyFieldApi) => React.ReactNode
  }) => React.ReactNode
}

type SharedPersonalizationFormFieldsProps = {
  form: PersonalizationFormApi
  includePrimaryUse?: boolean
}

export function SharedPersonalizationFormFields(props: SharedPersonalizationFormFieldsProps) {
  const includePrimaryUse = props.includePrimaryUse ?? true

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.1 }}
      className="flex flex-col gap-6"
    >
      {includePrimaryUse ? (
        <props.form.Field name="primaryUse">
          {(field: AnyFieldApi) => (
            <PersonalizationFormField
              index={0}
              label={language.t("settings.personalization.primaryUseTitle")}
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={field.state.value === "learn"}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-interactive-base",
                    field.state.value === "learn"
                      ? "border-border-interactive-base bg-surface-interactive-weak text-text-strong"
                      : "border-border-base bg-surface-raised-base text-text-weak hover:bg-surface-raised-base-hover",
                  )}
                  onClick={() => field.handleChange("learn")}
                >
                  <BookOpenTextIcon className="size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">
                    {language.t("settings.personalization.primaryUseLearn")}
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={field.state.value === "teach"}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-interactive-base",
                    field.state.value === "teach"
                      ? "border-border-interactive-base bg-surface-interactive-weak text-text-strong"
                      : "border-border-base bg-surface-raised-base text-text-weak hover:bg-surface-raised-base-hover",
                  )}
                  onClick={() => field.handleChange("teach")}
                >
                  <SchoolIcon className="size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">
                    {language.t("settings.personalization.primaryUseTeach")}
                  </span>
                </button>
              </div>
            </PersonalizationFormField>
          )}
        </props.form.Field>
      ) : null}

      <props.form.Field name="preferredName">
        {(field: AnyFieldApi) => (
          <PersonalizationFormField
            index={includePrimaryUse ? 1 : 0}
            label={language.t("settings.personalization.preferredNameTitle")}
          >
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="What should Buddy call you?"
            />
          </PersonalizationFormField>
        )}
      </props.form.Field>

      <props.form.Field name="occupation">
        {(field: AnyFieldApi) => (
          <PersonalizationFormField
            index={includePrimaryUse ? 2 : 1}
            label={language.t("settings.personalization.occupationTitle")}
          >
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Student, engineer..."
            />
          </PersonalizationFormField>
        )}
      </props.form.Field>

      <props.form.Field name="moreAboutYou">
        {(field: AnyFieldApi) => (
          <PersonalizationFormField
            index={includePrimaryUse ? 3 : 2}
            label={language.t("settings.personalization.moreAboutYouTitle")}
          >
            <Textarea
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Goals, context, preferences..."
              rows={4}
            />
          </PersonalizationFormField>
        )}
      </props.form.Field>
    </motion.div>
  )
}
