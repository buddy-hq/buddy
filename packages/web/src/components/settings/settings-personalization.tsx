import { useEffect } from "react"
import { useForm, useStore } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import {
  SettingsContent,
  SettingsListCard,
  SettingsRow,
  SettingsSectionHeader,
  SettingsSwitchControl,
} from "./settings-primitives"
import { GlobalAgentsMdSettingsPanel } from "./global-agents-md-settings-panel"
import { language } from "@/context/language"
import { usePersonalizationSettingsAutosave } from "@/state/personalization-settings"
import { globalConfigQueryOptions } from "@/state/global-config-query"
import { readPersonalization } from "@/state/project-config-readers"
import {
  SharedPersonalizationFormFields,
  SharedPersonalizationPrimaryUseField,
} from "./shared-personalization-form"
import { useConciseResponseSettings } from "@/state/concise-response-settings"

export function PersonalizationSettings() {
  const settingsQuery = useQuery(globalConfigQueryOptions())
  const conciseResponses = useConciseResponseSettings()
  const form = useForm({
    defaultValues: readPersonalization(settingsQuery.data ?? {}),
    onSubmit: async () => undefined,
  })
  const { save } = usePersonalizationSettingsAutosave(form, {
    globalConfig: settingsQuery.data,
    isPending: settingsQuery.isPending,
  })
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
      <div className="space-y-8">
        <div className="space-y-2.5">
          <SettingsSectionHeader title={language.t("settings.personalization.primaryUseTitle")} />
          <SharedPersonalizationPrimaryUseField
            form={form}
            onPrimaryUseChange={() => void save()}
          />
        </div>

        <div className="space-y-2.5">
          <SettingsSectionHeader
            title={language.t("settings.personalization.responseStyleSectionTitle")}
          />
          <SettingsListCard>
            <SettingsRow
              title={language.t("settings.personalization.conciseResponsesTitle")}
              description={language.t("settings.personalization.conciseResponsesDescription")}
              control={
                <SettingsSwitchControl
                  dataAction="settings-concise-responses"
                  checked={conciseResponses.enabled}
                  onCheckedChange={conciseResponses.setEnabled}
                  disabled={conciseResponses.loading || conciseResponses.saving}
                  ariaLabel={language.t("settings.personalization.conciseResponsesAria")}
                  onLabel={language.t("settings.notebook.on")}
                  offLabel={language.t("settings.notebook.off")}
                />
              }
            />
          </SettingsListCard>
          {conciseResponses.error ? (
            <p className="px-1 text-sm text-text-critical-base">{conciseResponses.error}</p>
          ) : null}
        </div>

        <div className="space-y-2.5">
          <SettingsSectionHeader
            title={language.t("settings.personalization.profileSectionTitle")}
          />
          <SharedPersonalizationFormFields form={form} />
          {submitError ? (
            <p className="px-1 text-sm text-text-critical-base">{String(submitError)}</p>
          ) : null}
        </div>

        <div className="space-y-2.5">
          <SettingsSectionHeader
            title={language.t("settings.personalization.instructionsSectionTitle")}
          />
          <SettingsListCard>
            <div className="h-[480px] min-h-[320px] overflow-hidden">
              <GlobalAgentsMdSettingsPanel active />
            </div>
          </SettingsListCard>
        </div>
      </div>
    </SettingsContent>
  )
}
