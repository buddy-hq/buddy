import { useMemo, useState } from "react"
import { Badge, Button, Separator } from "@buddy/ui"
import { ConnectProviderDialog } from "@/components/connect-provider-dialog"
import { language } from "@/context/language"
import { useProjectSettings } from "@/state/project-settings"
import { ProviderSourceBadge, SettingsListCard } from "./settings-primitives"
import { SettingsPanelContent } from "./settings-page"

export function ProvidersSettings({ directory }: { directory: string }) {
  const settings = useProjectSettings(directory, true)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerDialogTarget, setProviderDialogTarget] = useState<string | undefined>(undefined)

  const availableProviders = useMemo(
    () => settings.options.allProviders.filter((provider) => !provider.connected),
    [settings.options.allProviders],
  )

  function openProviderDialog(initialProvider?: string) {
    setProviderDialogTarget(initialProvider)
    setProviderDialogOpen(true)
  }

  return (
    <>
      <SettingsPanelContent
        title={language.t("settings.providers.title")}
        description={language.t("settings.providers.description")}
      >
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-base">
            {language.t("settings.providers.connectedProviders")}
          </h3>
          <SettingsListCard>
            {settings.options.providers.length > 0 ? (
              settings.options.providers.map((provider, index) => {
                const selected = provider.id === settings.selection.provider
                return (
                  <div
                    key={provider.id}
                    data-component="settings-provider-item"
                    data-provider-id={provider.id}
                    data-connected="true"
                  >
                    <div className="px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-text-base">{provider.name}</p>
                            <ProviderSourceBadge provider={provider} />
                            {selected ? (
                              <Badge variant="secondary">
                                {language.t("settings.providers.selected")}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-text-weak">
                            {provider.source === "env"
                              ? language.t("settings.providers.connectedFromEnv")
                              : language.t("settings.providers.connectedForNotebook")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!selected ? (
                            <Button
                              data-action={`settings-provider-set-default-${provider.id}`}
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => settings.actions.setProvider(provider.id)}
                            >
                              {language.t("settings.providers.setAsDefault")}
                            </Button>
                          ) : null}
                          <Button
                            data-action={`settings-provider-edit-${provider.id}`}
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => openProviderDialog(provider.id)}
                          >
                            {language.t("settings.providers.editConnection")}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {index === settings.options.providers.length - 1 ? null : <Separator />}
                  </div>
                )
              })
            ) : (
              <div className="px-4 py-8 text-sm text-text-weak">
                {language.t("settings.providers.noProvidersConnected")}
              </div>
            )}
          </SettingsListCard>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.providers.availableProviders")}
            </h3>
            <Button
              data-action="settings-provider-connect"
              type="button"
              size="xs"
              onClick={() => openProviderDialog(settings.selection.provider || undefined)}
            >
              {language.t("settings.providers.connectProvider")}
            </Button>
          </div>
          <SettingsListCard>
            {availableProviders.length > 0 ? (
              availableProviders.map((provider, index) => (
                <div
                  key={provider.id}
                  data-component="settings-provider-item"
                  data-provider-id={provider.id}
                  data-connected="false"
                >
                  <div className="px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-text-base">{provider.name}</p>
                          <ProviderSourceBadge provider={provider} />
                        </div>
                        <p className="mt-1 text-xs text-text-weak">
                          {provider.methods.length > 0
                            ? provider.methods.map((method) => method.label).join(" or ")
                            : language.t("settings.providers.connectionAvailable")}
                        </p>
                      </div>
                      <Button
                        data-action={`settings-provider-connect-${provider.id}`}
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => openProviderDialog(provider.id)}
                      >
                        {language.t("settings.providers.connectProvider")}
                      </Button>
                    </div>
                  </div>
                  {index === availableProviders.length - 1 ? null : <Separator />}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-sm text-text-weak">
                {language.t("settings.providers.allConnected")}
              </div>
            )}
          </SettingsListCard>
        </div>
      </SettingsPanelContent>
      <ConnectProviderDialog
        directory={directory}
        open={providerDialogOpen}
        providers={settings.options.allProviders}
        initialProvider={providerDialogTarget}
        onOpenChange={setProviderDialogOpen}
        onUpdated={settings.actions.refresh}
      />
    </>
  )
}
