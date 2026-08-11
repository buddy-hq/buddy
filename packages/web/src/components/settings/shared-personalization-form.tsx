import { cn, Input, RadioGroup, RadioGroupItem, Textarea } from "@buddy/ui"
import { BookOpenTextIcon, SchoolIcon, type AppIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import type { AnyFieldApi } from "@tanstack/react-form"
import {
  isPrimaryUse,
  type PersonalizationSettings,
  type PrimaryUse,
} from "@/state/project-config-readers"
import { SettingsListCard } from "./settings-primitives"

type PrimaryUseOption = {
  value: PrimaryUse
  fieldId: string
  icon: AppIcon
  titleKey: string
  descriptionKey: string
  /** What changes elsewhere in the app when this one is active. */
  consequenceKey?: string
}

const PRIMARY_USE_OPTIONS: PrimaryUseOption[] = [
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
    consequenceKey: "settings.personalization.primaryUseTeachConsequence",
  },
]

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

/**
 * The mode is a settings row like every other one — same card, same padding,
 * same separator. Selection is a left accent and a weak fill rather than a
 * brand-coloured flood, so the two modes read as peers with one chosen.
 */
export function SharedPersonalizationPrimaryUseField(props: {
  form: PersonalizationFormApi
  onPrimaryUseChange?: () => void
}) {
  return (
    <props.form.Field name="primaryUse">
      {(field: AnyFieldApi) => (
        <SettingsListCard>
          <RadioGroup
            aria-label={language.t("settings.personalization.primaryUseTitle")}
            className="gap-0"
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
              const selected = field.state.value === option.value

              return (
                <label
                  key={option.value}
                  htmlFor={option.fieldId}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-3 border-t border-border-base/60 px-4 py-3.5 transition-colors first:border-t-0 sm:px-5",
                    selected ? "bg-surface-weak" : "hover:bg-surface-raised-base-hover",
                  )}
                >
                  {selected ? (
                    <span
                      className="absolute inset-y-0 left-0 w-0.5 bg-surface-interactive-base"
                      aria-hidden
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      selected ? "text-icon-interactive-base" : "text-icon-weak-base",
                    )}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-medium tracking-[-0.01em] text-text-base">
                      {language.t(option.titleKey)}
                    </span>
                    <span className="text-xs text-text-weaker">
                      {language.t(option.descriptionKey)}
                      {option.consequenceKey ? ` ${language.t(option.consequenceKey)}` : ""}
                    </span>
                  </span>
                  <RadioGroupItem id={option.fieldId} value={option.value} />
                </label>
              )
            })}
          </RadioGroup>
        </SettingsListCard>
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
