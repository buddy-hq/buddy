import { useEffect, useMemo, useState } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SettingsIcon,
  SlidersHorizontalIcon,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from "@buddy/ui"
import { FileTextIcon } from "lucide-react"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { ConnectProviderDialog } from "@/components/connect-provider-dialog"
import { usePlatform } from "@/context/platform"
import { resolveDefaultPersonaID } from "@/state/chat-actions"
import { showDesktopUpdateToast } from "../lib/desktop-updates"
import type { LogLevel } from "@/state/project-settings"
import { useProjectSettings } from "@/state/project-settings"
import { ThemeSettingsSection } from "./settings/theme-settings-section"
import { ProviderSourceBadge, SettingsListCard, SettingsPanel, SettingsRow, type SettingsTab } from "./settings/settings-primitives"
import { advancedMathStatusLabel, useAdvancedMathRuntime } from "./settings/use-advanced-math-runtime"
import { ConfirmRemoveMathRuntimeDialog } from "./settings/confirm-remove-math-runtime-dialog"
import { GlobalAgentsMdSettingsPanel } from "./settings/global-agents-md-settings-panel"

const DEFAULT_VALUE = "__default__"

type SettingsModalProps = {
  directory: string
  open: boolean
  onOpenChange: (open: boolean) => void
}


export function SettingsModal(props: SettingsModalProps) {
  const platform = usePlatform()
  const settings = useProjectSettings(props.directory, props.open)
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerDialogTarget, setProviderDialogTarget] = useState<string | undefined>(undefined)
  const {
    advancedMathStatus,
    advancedMathLoading,
    advancedMathBusy,
    advancedMathEnabled,
    onToggleAdvancedMathRuntime,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    onConfirmRemoveMathRuntime,
  } = useAdvancedMathRuntime({
    open: props.open,
    platform: platform.platform,
  })

  useEffect(() => {
    if (!props.open) return
    setActiveTab("general")
  }, [props.open])

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

  const personaSelectValue =
    resolveDefaultPersonaID(settings.options.personas, settings.selection.persona || undefined) || "buddy"
  const logLevelSelectValue = settings.selection.logLevel || DEFAULT_VALUE
  const hasConnectedProviders = settings.options.providers.length > 0
  const availableProviders = useMemo(
    () => settings.options.allProviders.filter((provider) => !provider.connected),
    [settings.options.allProviders],
  )
  const showDesktopUpdateControls = platform.platform === "desktop" && !!platform.checkUpdate && !!platform.update
  const showAdvancedMathControls = platform.platform === "desktop"
  const footerHint = useMemo(() => {
    if (settings.status.loading) return "Loading settings..."
    if (settings.status.saving) return "Saving changes..."
    if (settings.status.error) return settings.status.error
    if (activeTab === "providers") return "Connections are shared by the notebook runtime."
    if (activeTab === "agents-md") return "Global instructions apply across notebooks and save automatically."
    return "Appearance applies to this app; notebook defaults apply only to this repository."
  }, [settings.status.loading, settings.status.saving, settings.status.error, activeTab])

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
              if (value === "general" || value === "providers" || value === "agents-md") {
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
                      App
                    </p>
                    <div className="space-y-1">
                      <TabsTrigger value="agents-md" className="h-9 flex-none rounded-lg px-3">
                        <FileTextIcon className="size-4" />
                        Instructions
                      </TabsTrigger>
                    </div>
                  </div>

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
                  <p className="font-medium text-foreground">Buddy</p>
                  <p className="mt-1 truncate">local: {getFilename(props.directory)}</p>
                </div>
              </TabsList>
            </div>

            <SettingsPanel
              value="general"
              title="General"
              description="Adjust Buddy appearance and notebook defaults for this repository."
            >
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Interface</h3>
                <SettingsListCard>
                  <ThemeSettingsSection />
                </SettingsListCard>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Notebook</h3>
                <SettingsListCard>
                  <SettingsRow
                    title="Default persona"
                    description="Choose which Buddy persona is selected by default for new prompts in this notebook."
                    control={
                      <Select
                        value={personaSelectValue}
                        onValueChange={settings.actions.setPersona}
                        disabled={settings.status.loading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select persona" />
                        </SelectTrigger>
                        <SelectContent>
                          {settings.options.personas.map((persona) => (
                            <SelectItem key={persona.id} value={persona.id}>
                              {persona.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />

                  <SettingsRow
                    title="Default intent"
                    description="Choose the default teaching intent for new prompts in this notebook. Auto leaves intent unforced."
                    control={
                      <Select
                        value={settings.selection.intent}
                        onValueChange={(value) =>
                          settings.actions.setIntent(value as "auto" | "learn" | "practice" | "assess")
                        }
                        disabled={settings.status.loading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select default intent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="learn">Learn</SelectItem>
                          <SelectItem value="practice">Practice</SelectItem>
                          <SelectItem value="assess">Assess</SelectItem>
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
              </div>

              {settings.status.providerMessage ? (
                <p className="text-sm text-muted-foreground">{settings.status.providerMessage}</p>
              ) : null}

              {showAdvancedMathControls || showDesktopUpdateControls ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Desktop app</h3>
                  <SettingsListCard>
                    {showAdvancedMathControls ? (
                      <>
                        <SettingsRow
                          title="Advanced math runtime"
                          description="Optional machine-wide runtime for Python-based math and plotting."
                          control={
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">
                                  {advancedMathStatusLabel(advancedMathStatus, advancedMathLoading)}
                                </span>
                                <Switch
                                  aria-label="Toggle advanced math runtime"
                                  checked={advancedMathEnabled}
                                  disabled={advancedMathBusy || advancedMathStatus === null}
                                  onCheckedChange={onToggleAdvancedMathRuntime}
                                />
                              </div>
                              {advancedMathStatus?.progressMessage ||
                              typeof advancedMathStatus?.progressPercent === "number" ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                    <span className="truncate">
                                      {advancedMathStatus?.progressMessage ?? "Working..."}
                                    </span>
                                    {typeof advancedMathStatus?.progressPercent === "number" ? (
                                      <span>{Math.round(advancedMathStatus.progressPercent)}%</span>
                                    ) : null}
                                  </div>
                                  <Progress value={advancedMathStatus?.progressPercent ?? 0} className="h-1.5" />
                                </div>
                              ) : null}
                              {advancedMathStatus?.lastError ? (
                                <p className="text-xs text-destructive">{advancedMathStatus.lastError}</p>
                              ) : null}
                            </div>
                          }
                        />
                        <Separator />
                      </>
                    ) : null}
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

            <SettingsPanel
              value="agents-md"
              title="Instructions"
              description="Manage global AGENTS.md instructions that apply to every notebook session."
              fillHeight
              forceMount
            >
              <GlobalAgentsMdSettingsPanel active={activeTab === "agents-md" && props.open} />
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
              {activeTab === "agents-md" ? null : (
                <Button
                  type="button"
                  onClick={() => void settings.actions.save()}
                  disabled={settings.status.loading || settings.status.saving}
                >
                  {settings.status.saving ? "Saving..." : "Save changes"}
                </Button>
              )}
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
      <ConfirmRemoveMathRuntimeDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        onConfirm={onConfirmRemoveMathRuntime}
      />
    </>
  )
}
