import { useEffect } from "react"
import { useForm, useStore } from "@tanstack/react-form"
import { SettingsContent, SettingsSectionHeader } from "./settings-primitives"
import { GlobalAgentsMdSettingsPanel } from "./global-agents-md-settings-panel"
import { language } from "@/context/language"
import { usePersonalizationSettingsAutosave } from "@/state/personalization-settings"
import { SharedPersonalizationFormFields } from "./shared-personalization-form"

export function PersonalizationSettings() {
  const form = useForm({
    defaultValues: {
      preferredName: "",
      occupation: "",
      moreAboutYou: "",
    },
    onSubmit: async () => undefined,
  })
  const { settingsQuery } = usePersonalizationSettingsAutosave(form)
  const submitError = useStore(form.store, (state) => state.errorMap.onSubmit)

  useEffect(() => {
    if (!settingsQuery.error) {
      return
    }

    form.setErrorMap({
      onSubmit: {
        form:
          settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : String(settingsQuery.error),
        fields: {},
      },
    })
  }, [form, settingsQuery.error])

  return (
    <SettingsContent>
      <div className="space-y-6">
        <div className="space-y-2">
          <SettingsSectionHeader
            title={language.t("settings.personalization.profileSectionTitle")}
            description={language.t("settings.personalization.profileSectionDescription")}
            badge="Global"
          />
          <SharedPersonalizationFormFields form={form} />
          {submitError ? (
            <p className="text-sm text-text-critical-base">{String(submitError)}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-2">
          <SettingsSectionHeader
            title={language.t("settings.personalization.instructionsSectionTitle")}
            description={language.t("settings.personalization.instructionsSectionDescription")}
            badge="Global"
          />
          <div className="h-[480px] min-h-[320px]">
            <GlobalAgentsMdSettingsPanel active />
          </div>
        </div>
      </div>
    </SettingsContent>
  )
}
