import { useMemo, useState } from "react";
import { Badge, Button, Separator } from "@buddy/ui";
import { ConnectProviderDialog } from "@/components/connect-provider-dialog";
import { useProjectSettings } from "@/state/project-settings";
import { ProviderSourceBadge, SettingsListCard } from "./settings-primitives";
import { SettingsPanelContent } from "./settings-page";

export function ProvidersSettings({ directory }: { directory: string }) {
  const settings = useProjectSettings(directory, true);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerDialogTarget, setProviderDialogTarget] = useState<
    string | undefined
  >(undefined);

  const availableProviders = useMemo(
    () =>
      settings.options.allProviders.filter((provider) => !provider.connected),
    [settings.options.allProviders],
  );

  function openProviderDialog(initialProvider?: string) {
    setProviderDialogTarget(initialProvider);
    setProviderDialogOpen(true);
  }

  return (
    <>
      <SettingsPanelContent
        title="Providers"
        description="Connect provider accounts and choose which connected provider is used for model selection."
      >
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            onClick={() => void settings.actions.save()}
            disabled={settings.status.loading || settings.status.saving}
          >
            {settings.status.saving ? "Saving..." : "Save changes"}
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Connected providers
          </h3>
          <SettingsListCard>
            {settings.options.providers.length > 0 ? (
              settings.options.providers.map((provider, index) => {
                const selected = provider.id === settings.selection.provider;
                return (
                  <div key={provider.id}>
                    <div className="px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">
                              {provider.name}
                            </p>
                            <ProviderSourceBadge provider={provider} />
                            {selected ? (
                              <Badge variant="secondary">Selected</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {provider.source === "env"
                              ? "Connected from environment variables."
                              : "Connected and available for this notebook."}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!selected ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                settings.actions.setProvider(provider.id)
                              }
                            >
                              Set as default
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => openProviderDialog(provider.id)}
                          >
                            Edit connection
                          </Button>
                        </div>
                      </div>
                    </div>
                    {index === settings.options.providers.length - 1 ? null : (
                      <Separator />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                No providers are connected yet.
              </div>
            )}
          </SettingsListCard>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-foreground">
              Available providers
            </h3>
            <Button
              type="button"
              size="xs"
              onClick={() =>
                openProviderDialog(settings.selection.provider || undefined)
              }
            >
              Connect provider
            </Button>
          </div>
          <SettingsListCard>
            {availableProviders.length > 0 ? (
              availableProviders.map((provider, index) => (
                <div key={provider.id}>
                  <div className="px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {provider.name}
                          </p>
                          <ProviderSourceBadge provider={provider} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {provider.methods.length > 0
                            ? provider.methods
                                .map((method) => method.label)
                                .join(" or ")
                            : "Connection available"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => openProviderDialog(provider.id)}
                      >
                        Connect provider
                      </Button>
                    </div>
                  </div>
                  {index === availableProviders.length - 1 ? null : (
                    <Separator />
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                All available providers are already connected.
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
  );
}
