import {
  Badge,
  Button,
  CheckIcon,
  cn,
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
import { Loader2Icon } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { providerNeedsConfigDisable } from "@/lib/provider-connection"
import {
  authorizeProviderOAuth,
  completeProviderOAuth,
  formatProviderAuthError,
  parseProviderConfirmationCode,
  removeProviderAuth,
  reloadProviderRuntime,
  type ProviderAuthAuthorization,
} from "../lib/provider-auth"
import { loadGlobalConfig, patchGlobalConfig } from "@/state/chat-actions"
import type { ProviderInfo, ProviderMethodInfo } from "@/state/chat-types"

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

function getProviderMethods(provider?: ProviderInfo): readonly ProviderMethodInfo[] {
  if (!provider) return []
  return provider.methods.length > 0 ? provider.methods : [FALLBACK_API_METHOD]
}

function getPreferredMethodIndex(methods: readonly ProviderMethodInfo[]) {
  const oauthIndex = methods.findIndex((method) => method.type === "oauth")
  return oauthIndex >= 0 ? oauthIndex : 0
}

function getMethodBadgeLabel(method: ProviderMethodInfo) {
  return method.type === "oauth"
    ? language.t("connectProviderDialog.oauthMethodBadge")
    : language.t("connectProviderDialog.apiMethodBadge")
}

function getMethodTitle(method: ProviderMethodInfo, providerName: string) {
  return method.type === "oauth"
    ? language.t("connectProviderDialog.oauthMethodTitle", { providerName })
    : language.t("connectProviderDialog.apiMethodTitle")
}

function getMethodDescription(method: ProviderMethodInfo, providerName: string) {
  return method.type === "oauth"
    ? language.t("connectProviderDialog.oauthMethodDescription", { providerName })
    : language.t("connectProviderDialog.apiMethodDescription", { providerName })
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
  const [oauthCompleting, setOauthCompleting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const oauthAttemptRef = useRef(0)
  const activeOAuthAttemptRef = useRef<
    { attempt: number; providerID: string; methodIndex: number } | undefined
  >(undefined)

  useEffect(() => {
    if (!props.open) return

    const initialProvider =
      props.initialProvider &&
      props.providers.some((provider) => provider.id === props.initialProvider)
        ? props.initialProvider
        : (props.providers[0]?.id ?? "")
    const initialMethods = getProviderMethods(
      props.providers.find((provider) => provider.id === initialProvider),
    )

    setProviderID(initialProvider)
    setMethodIndex(getPreferredMethodIndex(initialMethods))
    setAuthorization(undefined)
    setApiKey("")
    setCode("")
    setBusy(false)
    setOauthCompleting(false)
    activeOAuthAttemptRef.current = undefined
    setError(undefined)
  }, [props.initialProvider, props.open, props.providers])

  const selectedProvider = props.providers.find((provider) => provider.id === providerID)
  const methods = getProviderMethods(selectedProvider)
  const selectedMethod = methods[methodIndex] ?? methods[0]
  const canDisconnect = selectedProvider?.connected && selectedProvider.source !== "env"
  const envManaged = selectedProvider?.connected && selectedProvider.source === "env"
  const confirmationCode = parseProviderConfirmationCode(authorization?.instructions)
  const hasOAuthMethod = methods.some((method) => method.type === "oauth")
  const waitingForOAuthCallback = selectedMethod?.type === "oauth" && oauthCompleting

  function resetAuthState(nextMethodIndex = 0) {
    setMethodIndex(nextMethodIndex)
    setAuthorization(undefined)
    setApiKey("")
    setCode("")
    setError(undefined)
    setBusy(false)
    setOauthCompleting(false)
    activeOAuthAttemptRef.current = undefined
  }

  function matchesActiveOAuthAttempt(input: {
    attempt: number
    providerID: string
    methodIndex: number
  }) {
    const active = activeOAuthAttemptRef.current
    return (
      active?.attempt === input.attempt &&
      active.providerID === input.providerID &&
      active.methodIndex === input.methodIndex
    )
  }

  async function waitForAutoOAuthCompletion(input: {
    attempt: number
    providerID: string
    methodIndex: number
  }) {
    setOauthCompleting(true)

    try {
      await completeProviderOAuth({
        directory: props.directory,
        providerID: input.providerID,
        methodIndex: input.methodIndex,
      })

      if (!matchesActiveOAuthAttempt(input)) return
      await disposeAndReload()
    } catch (error) {
      if (!matchesActiveOAuthAttempt(input)) return
      setError(
        formatProviderAuthError(error, language.t("connectProviderDialog.startProviderLoginFailed")),
      )
    } finally {
      if (matchesActiveOAuthAttempt(input)) {
        activeOAuthAttemptRef.current = undefined
        setOauthCompleting(false)
      }
    }
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
      const client = getBuddyClient(props.directory)
      requireBuddyData(
        await client.auth.set({
          providerID,
          body: {
            type: "api",
            key: apiKey.trim(),
          },
        }),
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

    const attempt = oauthAttemptRef.current + 1
    oauthAttemptRef.current = attempt
    activeOAuthAttemptRef.current = undefined
    setBusy(true)
    setOauthCompleting(false)
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
      setBusy(false)
      platform.openLink(nextAuthorization.url)

      if (nextAuthorization.method === "auto") {
        const activeAttempt = {
          attempt,
          providerID,
          methodIndex,
        }
        activeOAuthAttemptRef.current = activeAttempt
        void waitForAutoOAuthCompletion(activeAttempt)
        return
      }
    } catch (error) {
      setBusy(false)
      setOauthCompleting(false)
      activeOAuthAttemptRef.current = undefined
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
      <DialogContent className="overflow-hidden sm:max-w-lg">
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
                  const nextProvider = props.providers.find((provider) => provider.id === value)
                  setProviderID(value)
                  resetAuthState(getPreferredMethodIndex(getProviderMethods(nextProvider)))
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
                <div className="rounded-xl border bg-surface px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-text-strong">
                        {selectedProvider.connected
                          ? language.t("connectProviderDialog.connectedStateTitle", {
                              providerName: selectedProvider.name,
                            })
                          : language.t("connectProviderDialog.notConnectedStateTitle", {
                              providerName: selectedProvider.name,
                            })}
                      </p>
                      <p className="text-xs text-text-weak">
                        {selectedProvider.connected
                          ? envManaged
                            ? language.t("connectProviderDialog.connectedViaEnv")
                            : language.t("connectProviderDialog.connectedStateDescription", {
                                providerName: selectedProvider.name,
                              })
                          : hasOAuthMethod
                            ? language.t("connectProviderDialog.notConnectedStateDescriptionOauth", {
                                providerName: selectedProvider.name,
                              })
                            : language.t("connectProviderDialog.notConnectedStateDescriptionApi", {
                                providerName: selectedProvider.name,
                              })}
                      </p>
                    </div>
                    <Badge variant={selectedProvider.connected ? "default" : "secondary"}>
                      {selectedProvider.connected
                        ? language.t("connectProviderDialog.connectedBadge")
                        : language.t("connectProviderDialog.notConnectedBadge")}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs text-text-weak">
                      {language.t("connectProviderDialog.authMethodLabel")}
                    </label>
                    {methods.length > 1 ? (
                      <p className="text-xs text-text-weaker">
                        {language.t("connectProviderDialog.authMethodHelp", {
                          providerName: selectedProvider.name,
                        })}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {methods.map((method, index) => {
                      const selected = index === methodIndex
                      const recommended = method.type === "oauth" && hasOAuthMethod

                      return (
                        <button
                          key={`${method.type}:${method.label}`}
                          type="button"
                          className={cn(
                            "flex min-h-[9rem] flex-col justify-between rounded-xl border px-3 py-3 text-left transition-colors",
                            selected
                              ? "border-border-interactive-base bg-surface-interactive-base/8 shadow-[0_0_0_1px_var(--color-border-interactive-base)]"
                              : "bg-surface hover:border-border-strong hover:bg-surface-weak/70",
                            busy && "cursor-not-allowed opacity-70",
                          )}
                          onClick={() => resetAuthState(index)}
                          disabled={busy}
                          aria-pressed={selected}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Badge variant={selected ? "default" : "secondary"}>
                              {getMethodBadgeLabel(method)}
                            </Badge>
                            {recommended ? (
                              <Badge variant="outline">
                                {language.t("connectProviderDialog.recommendedBadge")}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium text-text-strong">
                              {getMethodTitle(method, selectedProvider.name)}
                            </p>
                            <p className="text-xs leading-5 text-text-weak">
                              {getMethodDescription(method, selectedProvider.name)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-text-weak">
                            {selected ? (
                              <>
                                <CheckIcon className="size-3.5 text-icon-info-base" />
                                <span>{language.t("connectProviderDialog.selectedMethodBadge")}</span>
                              </>
                            ) : (
                              <span>{language.t("connectProviderDialog.chooseMethodBadge")}</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border bg-surface px-3 py-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-text-strong">
                      {selectedMethod?.type === "oauth"
                        ? language.t("connectProviderDialog.oauthPanelTitle", {
                            providerName: selectedProvider.name,
                          })
                        : language.t("connectProviderDialog.apiPanelTitle", {
                            providerName: selectedProvider.name,
                          })}
                    </p>
                    <p className="text-xs leading-5 text-text-weak">
                      {selectedMethod?.type === "oauth"
                        ? language.t("connectProviderDialog.oauthPanelDescription", {
                            providerName: selectedProvider.name,
                          })
                        : language.t("connectProviderDialog.apiPanelDescription", {
                            providerName: selectedProvider.name,
                          })}
                    </p>
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
                        <Button
                          className="w-full"
                          onClick={() =>
                            authorization?.url ? platform.openLink(authorization.url) : void startOAuth()
                          }
                          disabled={busy}
                        >
                          {busy
                            ? language.t("connectProviderDialog.waitingForAuthorization")
                            : authorization?.url
                              ? language.t("connectProviderDialog.reopenAuthorizationPage")
                              : language.t("connectProviderDialog.startOAuth", {
                                  providerName: selectedProvider.name,
                                })}
                        </Button>
                      ) : null}

                      {authorization ? (
                        <div className="min-w-0 space-y-3 rounded-xl border bg-surface-weak/40 px-3 py-3">
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
                                <div className="min-w-0 space-y-1">
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
                              <div className="flex items-center gap-2 rounded-lg border border-border-info-base/40 bg-surface-info-base/10 px-3 py-2 text-xs text-icon-info-base">
                                <Loader2Icon className="size-3.5 animate-spin" />
                                <span>
                                  {waitingForOAuthCallback
                                    ? language.t("connectProviderDialog.waitingForAuthorization")
                                    : language.t(
                                        "connectProviderDialog.waitingForAuthorizationHelp",
                                      )}
                                </span>
                              </div>
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
                </div>
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
