import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@buddy/ui"
import { language } from "@/context/language"
import { useProjectSettings } from "@/state/project-settings"
import { SettingsListCard, SettingsRow, SettingsContent } from "./settings-primitives"

export function ModelSettings({ directory }: { directory: string }) {
  const settings = useProjectSettings(directory, true)
  const hasConnectedProviders = settings.options.providers.length > 0

  return (
    <SettingsContent
      title={language.t("common.model")}
      description={language.t("settings.model.description")}
    >
      <SettingsListCard>
        <SettingsRow
          title={language.t("settings.model.providerTitle")}
          description={language.t("settings.model.providerDescription")}
          control={
            <Select
              value={settings.selection.provider}
              onValueChange={settings.actions.setProvider}
              disabled={settings.status.loading || !hasConnectedProviders}
            >
              <SelectTrigger data-action="settings-model-provider" className="w-full">
                <SelectValue
                  placeholder={
                    hasConnectedProviders
                      ? language.t("settings.model.selectProvider")
                      : language.t("settings.model.connectProviderFirst")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {settings.options.providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          title={language.t("common.model")}
          description={language.t("settings.model.modelDescription")}
          last
          control={
            <Select
              value={settings.selection.model}
              onValueChange={settings.actions.setModel}
              disabled={settings.status.loading || !hasConnectedProviders}
            >
              <SelectTrigger data-action="settings-model-model" className="w-full">
                <SelectValue
                  placeholder={
                    hasConnectedProviders
                      ? language.t("settings.model.selectModel")
                      : language.t("settings.model.connectProviderFirst")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {settings.options.providerModels.map((model) => (
                  <SelectItem key={`${settings.selection.provider}:${model.id}`} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsListCard>

      {settings.status.providerMessage ? (
        <p className="text-sm text-text-weak">{settings.status.providerMessage}</p>
      ) : null}
    </SettingsContent>
  )
}
