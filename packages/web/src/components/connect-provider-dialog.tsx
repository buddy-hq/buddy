import type { ProviderAuthAuthorization } from "@opencode-ai/sdk/v2/client"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import { type FormEvent, useEffect, useState } from "react"
import { usePlatform } from "@/context/platform"
import { getOpenCodeClient } from "../lib/opencode-client"
import type { ProviderInfo } from "@/state/chat-types"

type ConnectProviderDialogProps = {
  directory: string
  open: boolean
  providers: ProviderInfo[]
  initialProvider?: string
  onOpenChange: (open: boolean) => void
  onUpdated: () => Promise<void>
}

const FALLBACK_API_METHOD = {
  type: "api",
  label: "API key",
} as const

function formatError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { message?: unknown } }).data
    if (typeof data?.message === "string" && data.message) return data.message
  }
  if (error && typeof error === "object" && "error" in error) {
    const nested: string = formatError((error as { error?: unknown }).error, "")
    if (nested) return nested
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message) return message
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return fallback
}

function parseConfirmationCode(input?: string) {
  if (!input) return ""
  if (!input.includes(":")) return input
  return input.split(":")[1]?.trim() ?? input
}

export function ConnectProviderDialog(props: ConnectProviderDialogProps) {
  const platform = usePlatform()
  const [providerID, setProviderID] = useState("")
  const [methodIndex, setMethodIndex] = useState(0)
  const [authorization, setAuthorization] = useState<ProviderAuthAuthorization | undefined>(undefined)
  const [apiKey, setApiKey] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!props.open) return

    const initialProvider =
      props.initialProvider && props.providers.some((provider) => provider.id === props.initialProvider)
        ? props.initialProvider
        : props.providers[0]?.id ?? ""

    setProviderID(initialProvider)
    setMethodIndex(0)
    setAuthorization(undefined)
    setApiKey("")
    setCode("")
    setBusy(false)
    setError(undefined)
  }, [props.initialProvider, props.open, props.providers])

  const selectedProvider = props.providers.find((provider) => provider.id === providerID)
  const methods = selectedProvider
    ? selectedProvider.methods.length > 0
      ? selectedProvider.methods
      : [FALLBACK_API_METHOD]
    : []
  const selectedMethod = methods[methodIndex] ?? methods[0]
  const canDisconnect = selectedProvider?.connected && selectedProvider.source !== "env"
  const envManaged = selectedProvider?.connected && selectedProvider.source === "env"
  const confirmationCode = parseConfirmationCode(authorization?.instructions)

  function resetAuthState(nextMethodIndex = 0) {
    setMethodIndex(nextMethodIndex)
    setAuthorization(undefined)
    setApiKey("")
    setCode("")
    setError(undefined)
    setBusy(false)
  }

  async function disposeAndReload() {
    const client = getOpenCodeClient(props.directory)
    await client.global.dispose({ throwOnError: true })
    await props.onUpdated()
    props.onOpenChange(false)
  }

  async function handleApiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!providerID || !apiKey.trim()) {
      setError("API key is required")
      return
    }

    setBusy(true)
    setError(undefined)

    try {
      const client = getOpenCodeClient(props.directory)
      await client.auth.set(
        {
          providerID,
          auth: {
            type: "api",
            key: apiKey.trim(),
          },
        },
        { throwOnError: true },
      )
      await disposeAndReload()
    } catch (error) {
      setBusy(false)
      setError(formatError(error, "Failed to save provider credentials"))
    }
  }

  async function handleDisconnect() {
    if (!providerID) return

    setBusy(true)
    setError(undefined)

    try {
      const client = getOpenCodeClient(props.directory)
      await client.auth.remove(
        {
          providerID,
        },
        { throwOnError: true },
      )
      await disposeAndReload()
    } catch (error) {
      setBusy(false)
      setError(formatError(error, "Failed to remove provider credentials"))
    }
  }

  async function startOAuth() {
    if (!providerID) return

    setBusy(true)
    setError(undefined)
    setAuthorization(undefined)
    setCode("")

    try {
      const client = getOpenCodeClient(props.directory)
      const result = await client.provider.oauth.authorize(
        {
          providerID,
          method: methodIndex,
        },
        { throwOnError: true },
      )
      const nextAuthorization = result.data

      if (!nextAuthorization) {
        setBusy(false)
        return
      }

      setAuthorization(nextAuthorization)
      platform.openLink(nextAuthorization.url)

      if (nextAuthorization.method === "auto") {
        await client.provider.oauth.callback(
          {
            providerID,
            method: methodIndex,
          },
          { throwOnError: true },
        )
        await disposeAndReload()
        return
      }

      setBusy(false)
    } catch (error) {
      setBusy(false)
      setAuthorization(undefined)
      setError(formatError(error, "Failed to start provider login"))
    }
  }

  async function submitOAuthCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!providerID || !code.trim()) {
      setError("Authorization code is required")
      return
    }

    setBusy(true)
    setError(undefined)

    try {
      const client = getOpenCodeClient(props.directory)
      await client.provider.oauth.callback(
        {
          providerID,
          method: methodIndex,
          code: code.trim(),
        },
        { throwOnError: true },
      )
      await disposeAndReload()
    } catch (error) {
      setBusy(false)
      setError(formatError(error, "Invalid authorization code"))
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect provider</DialogTitle>
          <DialogDescription>Use your own provider account, subscription, or API key.</DialogDescription>
        </DialogHeader>

        {props.providers.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No providers are available for this notebook.</p>
        ) : (
          <div className="min-w-0 space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Provider</label>
              <Select
                value={providerID}
                onValueChange={(value) => {
                  setProviderID(value)
                  resetAuthState()
                }}
                disabled={busy}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProvider ? (
              <>
                <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  {selectedProvider.connected
                    ? envManaged
                      ? "Connected via environment variables."
                      : "Connected."
                    : "Not connected."}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Auth method</label>
                  <Select
                    value={String(methodIndex)}
                    onValueChange={(value) => resetAuthState(Number(value))}
                    disabled={busy || methods.length <= 1}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((method, index) => (
                        <SelectItem key={`${method.type}:${method.label}:${index}`} value={String(index)}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedMethod?.type === "api" ? (
                  <form className="space-y-3" onSubmit={(event) => void handleApiSubmit(event)}>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">API key</label>
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={`Enter your ${selectedProvider.name} API key`}
                        disabled={busy}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" type="submit" disabled={busy}>
                        {busy ? "Saving..." : "Save credentials"}
                      </Button>
                      {canDisconnect ? (
                        <Button type="button" variant="outline" onClick={() => void handleDisconnect()} disabled={busy}>
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                    {envManaged ? (
                      <p className="text-xs text-muted-foreground">
                        Remove the provider environment variable to disconnect this provider.
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <div className="space-y-3">
                    {!authorization || authorization.method !== "code" ? (
                      <Button className="w-full" onClick={() => void startOAuth()} disabled={busy}>
                        {busy ? "Waiting for authorization..." : "Start login"}
                      </Button>
                    ) : null}

                    {authorization ? (
                      <div className="min-w-0 space-y-3 rounded-md border px-3 py-3">
                        <div className="min-w-0 space-y-2">
                          <p className="text-xs text-muted-foreground">Authorization link</p>
                          <p className="text-sm text-muted-foreground">
                            Open the authorization page in your browser to continue connecting {selectedProvider.name}.
                          </p>
                          <a
                            className="inline-flex max-w-full text-sm text-primary underline-offset-4 hover:underline"
                            href={authorization.url}
                            target="_blank"
                            rel="noreferrer"
                            title={authorization.url}
                          >
                            Open authorization page
                          </a>
                        </div>

                        {authorization.method === "code" ? (
                          <form className="space-y-3" onSubmit={(event) => void submitOAuthCode(event)}>
                            <div className="space-y-1.5">
                              <label className="text-xs text-muted-foreground">Authorization code</label>
                              <Input
                                type="text"
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                                placeholder="Paste the code from the provider"
                                disabled={busy}
                              />
                            </div>
                            <Button className="w-full" type="submit" disabled={busy}>
                              {busy ? "Finishing login..." : "Complete login"}
                            </Button>
                          </form>
                        ) : (
                          <div className="space-y-2">
                            {confirmationCode ? (
                              <div className="space-y-1 min-w-0">
                                <p className="text-xs text-muted-foreground">Confirmation code</p>
                                <Input
                                  readOnly
                                  value={confirmationCode}
                                  className="font-mono text-xs"
                                  onFocus={(event) => event.currentTarget.select()}
                                />
                              </div>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              Waiting for the provider to finish authorization.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <DialogFooter className="gap-2 sm:justify-between">
                      {canDisconnect ? (
                        <Button type="button" variant="outline" onClick={() => void handleDisconnect()} disabled={busy}>
                          Disconnect
                        </Button>
                      ) : <span />}
                      {envManaged ? (
                        <span className="text-xs text-muted-foreground">
                          This provider is connected from the environment.
                        </span>
                      ) : null}
                    </DialogFooter>
                  </div>
                )}
              </>
            ) : null}

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
