import { Input, Textarea } from "@buddy/ui"
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
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-text-weaker">{label}</p>
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

export function SharedPersonalizationFormFields({ form }: { form: PersonalizationFormApi }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.1 }}
      className="flex flex-col gap-6"
    >
      <form.Field name="preferredName">
        {(field: AnyFieldApi) => (
          <PersonalizationFormField
            index={0}
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
      </form.Field>

      <form.Field name="occupation">
        {(field: AnyFieldApi) => (
          <PersonalizationFormField
            index={1}
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
      </form.Field>

      <form.Field name="moreAboutYou">
        {(field: AnyFieldApi) => (
          <PersonalizationFormField
            index={2}
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
      </form.Field>
    </motion.div>
  )
}
