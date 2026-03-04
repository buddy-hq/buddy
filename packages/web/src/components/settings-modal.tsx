import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SettingsIcon,
  SlidersHorizontalIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@buddy/ui"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { ConnectProviderDialog } from "@/components/connect-provider-dialog"
import { usePlatform } from "@/context/platform"
import { resolveDefaultModeID } from "@/state/chat-actions"
import { showDesktopUpdateToast } from "../lib/desktop-updates"
import type { ProviderInfo } from "@/state/chat-types"
import type { LogLevel } from "@/state/project-settings"
import { useProjectSettings } from "@/state/project-settings"

const DEFAULT_VALUE = "__default__"

type SettingsModalProps = {
  directory: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab = "general" | "providers"

function SettingsPanel(props: { value: SettingsTab; title: string; description: string; children: ReactNode }) {
  return (
    <TabsContent value={props.value} className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
      <div className="border-b border-border/60 px-5 py-5">
        <h2 className="text-base font-medium text-foreground">{props.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">{props.children}</div>
      </div>
    </TabsContent>
  )
}

function SettingsListCard(props: { children: ReactNode }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="px-0">{props.children}</CardContent>
    </Card>
  )
}

function SettingsRow(props: { title: string; description: string; control: ReactNode; last?: boolean }) {
  return (
    <>
      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{props.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
          </div>
          <div className="min-w-0 lg:w-[260px] lg:max-w-[260px]">{props.control}</div>
        </div>
      </div>
      {props.last ? null : <Separator />}
    </>
  )
}

function ProviderSourceBadge(props: { provider: ProviderInfo }) {
  const label =
    props.provider.source === "env"
      ? "Environment"
      : props.provider.source === "api"
        ? "API key"
        : props.provider.source === "custom"
          ? "Custom"
          : "Config"

  return (
    <Badge variant="outline" className="h-5">
      {label}
    </Badge>
  )
}

export function SettingsModal(props: SettingsModalProps) {
  const platform = usePlatform()
  const settings = useProjectSettings(props.directory, props.open)
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerDialogTarget, setProviderDialogTarget] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!props.open) return
    setActiveTab("general")
  }, [props.open])

  async function onSaveSettings() {
    await settings.actions.save()
  }

  function openProviderDialog(initialProvider?: string) {
    setProviderDialogTarget(initialProvider)
    setProviderDialogOpen(true)
  }

  async function onCheckForUpdates() {
    if (platform.platform !== "desktop" || !platform.checkUpdate || !platform.update) {
      return
    }

    setCheckingForUpdates(true)
    const result = await platform.checkUpdate().catch(() => ({ status: "error", stage: "check" }) as const)
    setCheckingForUpdates(false)

    switch (result.status) {
      case "ready":
        showDesktopUpdateToast({
          platform,
          version: result.version,
        })
        return
      case "up-to-date":
        toast("Buddy is up to date")
        return
      case "disabled":
        toast("Updates are unavailable in this build")
        return
      case "error":
        toast.error(
          result.stage === "download" ? "Found an update, but download failed" : "Failed to check for updates",
        )
        return
    }
  }

  const modeSelectValue =
    resolveDefaultModeID(
      settings.options.modes,
      settings.selection.mode || undefined,
    ) || "buddy"
  const logLevelSelectValue = settings.selection.logLevel || DEFAULT_VALUE
  const hasConnectedProviders = settings.options.providers.length > 0
  const availableProviders = useMemo(
    () => settings.options.allProviders.filter((provider) => !provider.connected),
    [settings.options.allProviders],
  )
  const showDesktopUpdateControls = platform.platform === "desktop" && !!platform.checkUpdate && !!platform.update
  const footerHint = (() => {
    if (settings.status.loading) return "Loading settings..."
    if (settings.status.saving) return "Saving changes..."
    if (settings.status.error) return settings.status.error
    if (activeTab === "providers") return "Connections are shared by the notebook runtime."
    return "Changes apply to this notebook only."
  })()

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setProviderDialogOpen(false)
            setActiveTab("general")
          }
          props.onOpenChange(nextOpen)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(720px,calc(100vh-2rem))] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          <Tabs
            orientation="vertical"
            value={activeTab}
            onValueChange={(value) => {
              if (value === "general" || value === "providers") {
                setActiveTab(value)
              }
            }}
            className="min-h-0 flex-1 gap-0"
          >
            <div className="flex h-full w-[220px] shrink-0 flex-col border-r border-border/60 bg-muted/20">
              <TabsList
                variant="line"
                className="flex h-full w-full flex-1 flex-col items-stretch justify-between rounded-none bg-transparent p-3"
              >
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Notebook
                    </p>
                    <div className="space-y-1">
                      <TabsTrigger value="general" className="h-9 flex-none rounded-lg px-3">
                        <SlidersHorizontalIcon className="size-4" />
                        General
                      </TabsTrigger>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Server
                    </p>
                    <div className="space-y-1">
                      <TabsTrigger value="providers" className="h-9 flex-none rounded-lg px-3">
                        <SettingsIcon className="size-4" />
                        Providers
                      </TabsTrigger>
                    </div>
                  </div>
                </div>

                <div className="px-2 py-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground/80">Buddy</p>
                  <p className="mt-1 truncate">local: {getFilename(props.directory)}</p>
                </div>
              </TabsList>
            </div>

            <SettingsPanel
              value="general"
              title="General"
              description="Configure notebook-specific defaults for Buddy in this repository."
            >
              <SettingsListCard>
                <SettingsRow
                  title="Default mode"
                  description="Choose which Buddy mode is selected by default for new prompts in this notebook."
                  control={
                    <Select
                      value={modeSelectValue}
                      onValueChange={settings.actions.setMode}
                      disabled={settings.status.loading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {settings.options.modes.map((mode) => (
                          <SelectItem key={mode.id} value={mode.id}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />

                <SettingsRow
                  title="Log level"
                  description="Controls backend logging verbosity for this notebook."
                  control={
                    <Select
                      value={logLevelSelectValue}
                      onValueChange={(value) =>
                        settings.actions.setLogLevel(value === DEFAULT_VALUE ? "" : (value as LogLevel))
                      }
                      disabled={settings.status.loading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT_VALUE}>Default</SelectItem>
                        {import.meta.env.DEV && <SelectItem value="debug">debug</SelectItem>}
                        <SelectItem value="info">info</SelectItem>
                        <SelectItem value="warn">warn</SelectItem>
                        <SelectItem value="error">error</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />

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
                          placeholder={hasConnectedProviders ? "Select provider" : "Connect a provider first"}
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
                          placeholder={hasConnectedProviders ? "Select model" : "Connect a provider first"}
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

              {showDesktopUpdateControls ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Desktop app</h3>
                  <SettingsListCard>
                    <SettingsRow
                      title="App updates"
                      description="Check for and install desktop app updates. This applies to Buddy itself, not this notebook."
                      last
                      control={
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => void onCheckForUpdates()}
                          disabled={checkingForUpdates}
                        >
                          {checkingForUpdates ? "Checking..." : "Check for updates"}
                        </Button>
                      }
                    />
                  </SettingsListCard>
                </div>
              ) : null}
            </SettingsPanel>

            <SettingsPanel
              value="providers"
              title="Providers"
              description="Connect provider accounts and choose which connected provider is used for model selection."
            >
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Connected providers</h3>
                <SettingsListCard>
                  {settings.options.providers.length > 0 ? (
                    settings.options.providers.map((provider, index) => {
                      const selected = provider.id === settings.selection.provider

                      return (
                        <div key={provider.id}>
                          <div className="px-4 py-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-foreground">{provider.name}</p>
                                  <ProviderSourceBadge provider={provider} />
                                  {selected ? <Badge variant="secondary">Selected</Badge> : null}
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
                                    onClick={() => settings.actions.setProvider(provider.id)}
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
                          {index === settings.options.providers.length - 1 ? null : <Separator />}
                        </div>
                      )
                    })
                  ) : (
                    <div className="px-4 py-8 text-sm text-muted-foreground">No providers are connected yet.</div>
                  )}
                </SettingsListCard>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-foreground">Available providers</h3>
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => openProviderDialog(settings.selection.provider || undefined)}
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
                                <p className="text-sm font-medium text-foreground">{provider.name}</p>
                                <ProviderSourceBadge provider={provider} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {provider.methods.length > 0
                                  ? provider.methods.map((method) => method.label).join(" or ")
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
                        {index === availableProviders.length - 1 ? null : <Separator />}
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-sm text-muted-foreground">
                      All available providers are already connected.
                    </div>
                  )}
                </SettingsListCard>
              </div>
            </SettingsPanel>
          </Tabs>

          <Separator />
          <div className="flex items-center justify-between gap-3 bg-muted/20 px-5 py-3">
            <p
              className={`min-w-0 flex-1 text-xs ${
                settings.status.error ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {footerHint}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => void onSaveSettings()}
                disabled={settings.status.loading || settings.status.saving}
              >
                {settings.status.saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConnectProviderDialog
        directory={props.directory}
        open={props.open && providerDialogOpen}
        providers={settings.options.allProviders}
        initialProvider={providerDialogTarget}
        onOpenChange={setProviderDialogOpen}
        onUpdated={settings.actions.refresh}
      />
    </>
  )
}
