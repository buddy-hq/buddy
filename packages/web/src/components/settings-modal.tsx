import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import { useState } from "react"
import { ConnectProviderDialog } from "@/components/connect-provider-dialog"
import type { LogLevel } from "@/state/project-settings"
import { useProjectSettings } from "@/state/project-settings"

const AUTO_VALUE = "__auto__"
const DEFAULT_VALUE = "__default__"

type SettingsModalProps = {
  directory: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal(props: SettingsModalProps) {
  const settings = useProjectSettings(props.directory, props.open)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerDialogTarget, setProviderDialogTarget] = useState<string | undefined>(undefined)

  async function onSaveSettings() {
    const saved = await settings.actions.save()
    if (saved) {
      props.onOpenChange(false)
    }
  }

  function openProviderDialog(initialProvider?: string) {
    setProviderDialogTarget(initialProvider)
    setProviderDialogOpen(true)
  }

  const agentSelectValue = settings.selection.agent || AUTO_VALUE
  const logLevelSelectValue = settings.selection.logLevel || DEFAULT_VALUE
  const hasConnectedProviders = settings.options.providers.length > 0

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setProviderDialogOpen(false)
          }
          props.onOpenChange(nextOpen)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          {settings.status.loading ? (
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Default agent</label>
                <Select
                  value={agentSelectValue}
                  onValueChange={(value) => settings.actions.setAgent(value === AUTO_VALUE ? "" : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_VALUE}>Auto</SelectItem>
                    {settings.options.agents.map((agent) => (
                      <SelectItem key={agent.name} value={agent.name}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Connected provider</label>
                <Select
                  value={settings.selection.provider}
                  onValueChange={settings.actions.setProvider}
                  disabled={!hasConnectedProviders}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={hasConnectedProviders ? "Select provider" : "Connect a provider first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.options.providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Model</label>
                <Select
                  value={settings.selection.model}
                  onValueChange={settings.actions.setModel}
                  disabled={!hasConnectedProviders}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={hasConnectedProviders ? "Select model" : "Connect a provider first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.options.providerModels.map((model) => (
                      <SelectItem key={`${settings.selection.provider}:${model.id}`} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {settings.status.providerMessage ? (
                <p className="rounded-md border px-2 py-1.5 text-xs text-muted-foreground">
                  {settings.status.providerMessage}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={() => openProviderDialog(settings.selection.provider || undefined)}>
                  Connect provider
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openProviderDialog(settings.selection.provider)}
                  disabled={!settings.selection.provider}
                >
                  Manage connection
                </Button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Log level</label>
                <Select
                  value={logLevelSelectValue}
                  onValueChange={(value) => settings.actions.setLogLevel(value === DEFAULT_VALUE ? "" : (value as LogLevel))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_VALUE}>Default</SelectItem>
                    <SelectItem value="debug">debug</SelectItem>
                    <SelectItem value="info">info</SelectItem>
                    <SelectItem value="warn">warn</SelectItem>
                    <SelectItem value="error">error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" onClick={() => void onSaveSettings()} disabled={settings.status.saving}>
                {settings.status.saving ? "Saving..." : "Save settings"}
              </Button>
            </div>
          )}

          {settings.status.error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {settings.status.error}
            </p>
          ) : null}
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
