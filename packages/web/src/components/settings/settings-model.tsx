import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@buddy/ui'
import { useProjectSettings } from '@/state/project-settings'
import { SettingsListCard, SettingsRow } from './settings-primitives'
import { SettingsPanelContent } from './settings-page'

export function ModelSettings({ directory }: { directory: string }) {
  const settings = useProjectSettings(directory, true)
  const hasConnectedProviders = settings.options.providers.length > 0

  return (
    <SettingsPanelContent
      title="Model"
      description="Choose which provider and model Buddy uses in this notebook."
    >
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          onClick={() => void settings.actions.save()}
          disabled={settings.status.loading || settings.status.saving}
        >
          {settings.status.saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <SettingsListCard>
        <SettingsRow
          title="Provider"
          description="Choose which connected provider Buddy uses for notebook-level model selection."
          control={
            <Select
              value={settings.selection.provider}
              onValueChange={settings.actions.setProvider}
              disabled={settings.status.loading || !hasConnectedProviders}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    hasConnectedProviders ? 'Select provider' : 'Connect a provider first'
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
          title="Model"
          description="Pick the default model Buddy uses in this notebook. This does not control model visibility."
          last
          control={
            <Select
              value={settings.selection.model}
              onValueChange={settings.actions.setModel}
              disabled={settings.status.loading || !hasConnectedProviders}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={hasConnectedProviders ? 'Select model' : 'Connect a provider first'}
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
        <p className="text-sm text-muted-foreground">{settings.status.providerMessage}</p>
      ) : null}
    </SettingsPanelContent>
  )
}
