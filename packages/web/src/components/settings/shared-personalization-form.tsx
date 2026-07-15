import {
  cn,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from "@buddy/ui"
import { BookOpenTextIcon, SchoolIcon } from "lucide-react"
import { language } from "@/context/language"
import type { AnyFieldApi } from "@tanstack/react-form"
import { isPrimaryUse, type PersonalizationSettings } from "@/state/project-config-readers"
import { SettingsListCard } from "./settings-primitives"

const PRIMARY_USE_OPTIONS = [
  {
    value: "learn",
    fieldId: "personalization-primary-use-learn",
    icon: BookOpenTextIcon,
    titleKey: "settings.personalization.primaryUseLearn",
    descriptionKey: "settings.personalization.primaryUseLearnDescription",
  },
  {
    value: "teach",
    fieldId: "personalization-primary-use-teach",
    icon: SchoolIcon,
    titleKey: "settings.personalization.primaryUseTeach",
    descriptionKey: "settings.personalization.primaryUseTeachDescription",
  },
] as const

type PersonalizationFormApi = {
  Field: (props: {
    name: keyof PersonalizationSettings
    children: (field: AnyFieldApi) => React.ReactNode
  }) => React.ReactNode
}

type SharedPersonalizationFormFieldsProps = {
  form: PersonalizationFormApi
}

function FieldBlock(props: { title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className={cn(
        "space-y-2 px-4 py-3.5 sm:px-5",
        props.first ? undefined : "border-t border-border-base/60",
      )}
    >
      <p className="text-[13px] font-medium tracking-[-0.01em] text-text-base">{props.title}</p>
      {props.children}
    </div>
  )
}

export function SharedPersonalizationPrimaryUseField(props: {
  form: PersonalizationFormApi
  onPrimaryUseChange?: () => void
}) {
  return (
    <props.form.Field name="primaryUse">
      {(field: AnyFieldApi) => (
        <RadioGroup
          aria-label={language.t("settings.personalization.primaryUseTitle")}
          className="grid-cols-1 sm:grid-cols-2"
          value={field.state.value}
          onValueChange={(value) => {
            if (isPrimaryUse(value)) {
              field.handleChange(value)
              props.onPrimaryUseChange?.()
            }
          }}
        >
          {PRIMARY_USE_OPTIONS.map((option) => {
            const Icon = option.icon

            return (
              <FieldLabel key={option.value} htmlFor={option.fieldId} className="cursor-pointer">
                <Field orientation="horizontal" className="min-w-0 gap-3">
                  <Icon className="size-4 shrink-0 text-icon-base" />
                  <FieldContent>
                    <FieldTitle>{language.t(option.titleKey)}</FieldTitle>
                    <FieldDescription>{language.t(option.descriptionKey)}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem id={option.fieldId} value={option.value} />
                </Field>
              </FieldLabel>
            )
          })}
        </RadioGroup>
      )}
    </props.form.Field>
  )
}

export function SharedPersonalizationFormFields(props: SharedPersonalizationFormFieldsProps) {
  return (
    <SettingsListCard>
      <props.form.Field name="preferredName">
        {(field: AnyFieldApi) => (
          <FieldBlock title={language.t("settings.personalization.preferredNameTitle")} first>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="What should Buddy call you?"
              className="w-full"
            />
          </FieldBlock>
        )}
      </props.form.Field>

      <props.form.Field name="occupation">
        {(field: AnyFieldApi) => (
          <FieldBlock title={language.t("settings.personalization.occupationTitle")}>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Student, engineer..."
              className="w-full"
            />
          </FieldBlock>
        )}
      </props.form.Field>

      <props.form.Field name="moreAboutYou">
        {(field: AnyFieldApi) => (
          <FieldBlock title={language.t("settings.personalization.moreAboutYouTitle")}>
            <Textarea
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Goals, context, preferences..."
              rows={4}
              className="w-full resize-y"
            />
          </FieldBlock>
        )}
      </props.form.Field>
    </SettingsListCard>
  )
}
