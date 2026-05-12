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
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { providerNeedsConfigDisable } from "@/lib/provider-connection"
import { getOpenCodeClient } from "../lib/opencode-client"
import {
  authorizeProviderOAuth,
  completeProviderOAuth,
  formatProviderAuthError,
  parseProviderConfirmationCode,
  removeProviderAuth,
  reloadProviderRuntime,
} from "../lib/provider-auth"
import { loadGlobalConfig, patchGlobalConfig } from "@/state/chat-actions"
import type { ProviderInfo } from "@/state/chat-types"

type ConnectProviderDialogProps = {
  directory?: string
  open: boolean
  providers: ProviderInfo[]
  initialProvider?: string
  onOpenChange: (open: boolean) => void
  onUpdated: () => Promise<void>
}

const FALLBACK_API_METHOD = {
  type: "api",
  label: language.t("connectProviderDialog.fallbackApiMethodLabel"),
} as const

const DISABLED_PROVIDERS_CONFIG_KEY = "disabled_providers"

function readDisabledProviders(config: Record<string, unknown>) {
  const value = config[DISABLED_PROVIDERS_CONFIG_KEY]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

export function ConnectProviderDialog(props: ConnectProviderDialogProps) {
  const platform = usePlatform()
  const [providerID, setProviderID] = useState("")
  const [methodIndex, setMethodIndex] = useState(0)
  const [authorization, setAuthorization] = useState<ProviderAuthAuthorization | undefined>(
    undefined,
  )
  const [apiKey, setApiKey] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!props.open) return

    const initialProvider =
      props.initialProvider &&
      props.providers.some((provider) => provider.id === props.initialProvider)
        ? props.initialProvider
        : (props.providers[0]?.id ?? "")

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
  const confirmationCode = parseProviderConfirmationCode(authorization?.instructions)

  function resetAuthState(nextMethodIndex = 0) {
    setMethodIndex(nextMethodIndex)
    setAuthorization(undefined)
    setApiKey("")
    setCode("")
    setError(undefined)
    setBusy(false)
  }

  async function disposeAndReload() {
    await reloadProviderRuntime(props.directory)
    await props.onUpdated()
    props.onOpenChange(false)
  }

  async function handleApiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!providerID || !apiKey.trim()) {
      setError(language.t("connectProviderDialog.apiKeyRequired"))
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
      setError(
        formatProviderAuthError(error, language.t("connectProviderDialog.saveCredentialsFailed")),
      )
    }
  }

  async function handleDisconnect() {
    if (!providerID || !selectedProvider) return

    setBusy(true)
    setError(undefined)

    try {
      await removeProviderAuth({
        directory: props.directory,
        providerID,
      })
      const config = await loadGlobalConfig()
      if (providerNeedsConfigDisable(selectedProvider, config)) {
        const disabledProviders = readDisabledProviders(config)
        if (!disabledProviders.includes(providerID)) {
          await patchGlobalConfig({
            [DISABLED_PROVIDERS_CONFIG_KEY]: [...disabledProviders, providerID],
          })
        }
      }
      await disposeAndReload()
    } catch (error) {
      setBusy(false)
      setError(
        formatProviderAuthError(error, language.t("connectProviderDialog.removeCredentialsFailed")),
      )
    }
  }

  async function startOAuth() {
    if (!providerID) return

    setBusy(true)
    setError(undefined)
    setAuthorization(undefined)
    setCode("")

    try {
      const nextAuthorization = await authorizeProviderOAuth({
        directory: props.directory,
        providerID,
        methodIndex,
      })

      if (!nextAuthorization) {
        setBusy(false)
        return
      }

      setAuthorization(nextAuthorization)
      platform.openLink(nextAuthorization.url)

      if (nextAuthorization.method === "auto") {
        await completeProviderOAuth({
          directory: props.directory,
          providerID,
          methodIndex,
        })
        await disposeAndReload()
        return
      }

      setBusy(false)
    } catch (error) {
      setBusy(false)
      setAuthorization(undefined)
      setError(
        formatProviderAuthError(
          error,
          language.t("connectProviderDialog.startProviderLoginFailed"),
        ),
      )
    }
  }

  async function submitOAuthCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!providerID || !code.trim()) {
      setError(language.t("connectProviderDialog.authCodeRequired"))
      return
    }

    setBusy(true)
    setError(undefined)

    try {
      await completeProviderOAuth({
        directory: props.directory,
        providerID,
        methodIndex,
        code: code.trim(),
      })
      await disposeAndReload()
    } catch (error) {
      setBusy(false)
      setError(formatProviderAuthError(error, language.t("connectProviderDialog.invalidAuthCode")))
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{language.t("connectProviderDialog.title")}</DialogTitle>
          <DialogDescription>{language.t("connectProviderDialog.description")}</DialogDescription>
        </DialogHeader>

        {props.providers.length === 0 ? (
          <p className="py-2 text-sm text-text-weak">
            {language.t("connectProviderDialog.noProvidersForNotebook")}
          </p>
        ) : (
          <div className="min-w-0 space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-text-weak">
                {language.t("connectProviderDialog.providerLabel")}
              </label>
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
                <div className="rounded-md border px-3 py-2 text-xs text-text-weak">
                  {selectedProvider.connected
                    ? envManaged
                      ? language.t("connectProviderDialog.connectedViaEnv")
                      : language.t("connectProviderDialog.connected")
                    : language.t("connectProviderDialog.notConnected")}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-text-weak">
                    {language.t("connectProviderDialog.authMethodLabel")}
                  </label>
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
                        <SelectItem key={`${method.type}:${method.label}`} value={String(index)}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedMethod?.type === "api" ? (
                  <form className="space-y-3" onSubmit={(event) => void handleApiSubmit(event)}>
                    <div className="space-y-1.5">
                      <label className="text-xs text-text-weak">
                        {language.t("connectProviderDialog.apiKeyLabel")}
                      </label>
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={language.t("connectProviderDialog.apiKeyPlaceholder", {
                          providerName: selectedProvider.name,
                        })}
                        disabled={busy}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" type="submit" disabled={busy}>
                        {busy
                          ? language.t("common.saving")
                          : language.t("connectProviderDialog.saveCredentials")}
                      </Button>
                      {canDisconnect ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleDisconnect()}
                          disabled={busy}
                        >
                          {language.t("connectProviderDialog.disconnect")}
                        </Button>
                      ) : null}
                    </div>
                    {envManaged ? (
                      <p className="text-xs text-text-weak">
                        {language.t("connectProviderDialog.envDisconnectHelp")}
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <div className="space-y-3">
                    {!authorization || authorization.method !== "code" ? (
                      <Button className="w-full" onClick={() => void startOAuth()} disabled={busy}>
                        {busy
                          ? language.t("connectProviderDialog.waitingForAuthorization")
                          : language.t("connectProviderDialog.startLogin")}
                      </Button>
                    ) : null}

                    {authorization ? (
                      <div className="min-w-0 space-y-3 rounded-md border px-3 py-3">
                        <div className="min-w-0 space-y-2">
                          <p className="text-xs text-text-weak">
                            {language.t("connectProviderDialog.authorizationLinkLabel")}
                          </p>
                          <p className="text-sm text-text-weak">
                            {language.t("connectProviderDialog.authorizationHelpPrefix")}{" "}
                            {selectedProvider.name}.
                          </p>
                          <a
                            className="inline-flex max-w-full text-sm text-text-interactive-base underline-offset-4 hover:underline"
                            href={authorization.url}
                            target="_blank"
                            rel="noreferrer"
                            title={authorization.url}
                          >
                            {language.t("connectProviderDialog.openAuthorizationPage")}
                          </a>
                        </div>

                        {authorization.method === "code" ? (
                          <form
                            className="space-y-3"
                            onSubmit={(event) => void submitOAuthCode(event)}
                          >
                            <div className="space-y-1.5">
                              <label className="text-xs text-text-weak">
                                {language.t("connectProviderDialog.authorizationCodeLabel")}
                              </label>
                              <Input
                                type="text"
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                                placeholder={language.t(
                                  "connectProviderDialog.authorizationCodePlaceholder",
                                )}
                                disabled={busy}
                              />
                            </div>
                            <Button className="w-full" type="submit" disabled={busy}>
                              {busy
                                ? language.t("connectProviderDialog.continueInBrowser")
                                : language.t("connectProviderDialog.submitCode")}
                            </Button>
                          </form>
                        ) : (
                          <div className="space-y-2">
                            {confirmationCode ? (
                              <div className="space-y-1 min-w-0">
                                <p className="text-xs text-text-weak">
                                  {language.t("connectProviderDialog.confirmationCodeLabel")}
                                </p>
                                <Input
                                  readOnly
                                  value={confirmationCode}
                                  className="font-mono text-xs"
                                  onFocus={(event) => event.currentTarget.select()}
                                />
                              </div>
                            ) : null}
                            <p className="text-xs text-text-weak">
                              {language.t("connectProviderDialog.waitingForAuthorization")}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <DialogFooter className="gap-2 sm:justify-between">
                      {canDisconnect ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleDisconnect()}
                          disabled={busy}
                        >
                          {language.t("connectProviderDialog.disconnect")}
                        </Button>
                      ) : (
                        <span />
                      )}
                      {envManaged ? (
                        <span className="text-xs text-text-weak">
                          {language.t("connectProviderDialog.connectedAsReadOnly")}
                        </span>
                      ) : null}
                    </DialogFooter>
                  </div>
                )}
              </>
            ) : null}

            {error ? (
              <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
