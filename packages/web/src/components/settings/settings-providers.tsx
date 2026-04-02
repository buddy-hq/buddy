import { useMemo, useState } from "react"
import { Button, Separator } from "@buddy/ui"
import { ConnectProviderDialog } from "@/components/connect-provider-dialog"
import { language } from "@/context/language"
import { useProjectSettings } from "@/state/project-settings"
import { ProviderSourceBadge, SettingsListCard, SettingsContent } from "./settings-primitives"

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
      <SettingsContent>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-base">
            {language.t("settings.providers.connectedProviders")}
          </h3>
          <SettingsListCard>
            {settings.options.providers.length > 0 ? (
              settings.options.providers.map((provider, index) => {
                return (
                  <div
                    key={provider.id}
                    data-component="settings-provider-item"
                    data-provider-id={provider.id}
                    data-connected="true"
                  >
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="text-sm font-medium text-text-base truncate">
                          {provider.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <ProviderSourceBadge provider={provider} />
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          data-action={`settings-provider-edit-${provider.id}`}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="active:scale-[0.97] transition-transform duration-150 ease-out"
                          onClick={() => openProviderDialog(provider.id)}
                        >
                          {language.t("settings.providers.editConnection")}
                        </Button>
                      </div>
                    </div>
                    {index === settings.options.providers.length - 1 ? null : <Separator />}
                  </div>
                )
              })
            ) : (
              <div className="px-4 py-6 text-center text-sm text-text-weak">
                {language.t("settings.providers.noProvidersConnected")}
              </div>
            )}
          </SettingsListCard>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-base">
            {language.t("settings.providers.availableProviders")}
          </h3>
          <SettingsListCard>
            {availableProviders.length > 0 ? (
              availableProviders.map((provider, index) => (
                <div
                  key={provider.id}
                  data-component="settings-provider-item"
                  data-provider-id={provider.id}
                  data-connected="false"
                >
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-sm font-medium text-text-base truncate">
                        {provider.name}
                      </span>
                      {provider.methods.length > 0 && (
                        <span className="truncate text-xs text-text-weak hidden sm:inline-block">
                          {provider.methods.map((method) => method.label).join(" • ")}
                        </span>
                      )}
                    </div>

                    <Button
                      data-action={`settings-provider-connect-${provider.id}`}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0 active:scale-[0.97] transition-all duration-150 ease-out"
                      onClick={() => openProviderDialog(provider.id)}
                    >
                      {language.t("common.connect")}
                    </Button>
                  </div>
                  {index === availableProviders.length - 1 ? null : <Separator />}
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-text-weak">
                {language.t("settings.providers.allConnected")}
              </div>
            )}
          </SettingsListCard>
        </div>
      </SettingsContent>
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
