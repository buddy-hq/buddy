import type { ProviderAuthAuthorization } from "@buddy/sdk"
import {
  Button,
  ChevronLeftIcon,
  CircleCheckIcon,
  CopyIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@buddy/ui"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { providerNeedsConfigDisable } from "@/lib/provider-connection"
import { getBuddyClient } from "@/lib/buddy-client"
import {
  authorizeProviderOAuth,
  cancelProviderOAuth,
  completeProviderOAuth,
  formatProviderAuthError,
  isProviderAuthFlowInterrupted,
  parseProviderConfirmationCode,
  removeProviderAuth,
  reloadProviderRuntime,
} from "../lib/provider-auth"
import { loadGlobalConfig, patchGlobalConfig } from "@/state/chat-actions"
import type { ProviderInfo } from "@/state/chat-types"

type ConnectProviderDialogProps = {
  open: boolean
  provider: ProviderInfo
  onOpenChange: (open: boolean) => void
  onUpdated: () => Promise<void>
}

// Each ViewState represents a discrete screen in the dialog flow:
// status       – provider is connected; shows status + actions (disconnect / update / reconnect)
// method-select – choose which auth method to use (only when N > 1 methods)
// api-form     – enter API key
// oauth-start  – single-method OAuth; confirm before browser opens
// oauth-pending – browser/code OAuth in flight
type ViewState =
  | { kind: "status" }
  | { kind: "method-select" }
  | { kind: "api-form" }
  | { kind: "oauth-start"; methodIndex: number }
  | { kind: "oauth-pending"; methodIndex: number }

const FALLBACK_API_METHOD = {
  type: "api" as const,
  label: language.t("connectProviderDialog.fallbackApiMethodLabel"),
}

const DISABLED_PROVIDERS_CONFIG_KEY = "disabled_providers"

function readDisabledProviders(config: Record<string, unknown>) {
  const value = config[DISABLED_PROVIDERS_CONFIG_KEY]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function resolveMethods(provider: ProviderInfo) {
  return provider.methods.length > 0 ? provider.methods : [FALLBACK_API_METHOD]
}

function resolveInitialState(provider: ProviderInfo): ViewState {
  if (provider.connected) return { kind: "status" }
  const methods = resolveMethods(provider)
  if (methods.length > 1) return { kind: "method-select" }
  const method = methods[0]!
  if (method.type === "oauth") return { kind: "oauth-start", methodIndex: 0 }
  return { kind: "api-form" }
}

// Where to go when navigating forward from "status" (reconnect / update)
function resolveReconnectTarget(provider: ProviderInfo): ViewState {
  const methods = resolveMethods(provider)
  if (methods.length > 1) return { kind: "method-select" }
  const method = methods[0]!
  if (method.type === "oauth") return { kind: "oauth-start", methodIndex: 0 }
  return { kind: "api-form" }
}

export function ConnectProviderDialog(props: ConnectProviderDialogProps) {
  const platform = usePlatform()
  const [viewState, setViewState] = useState<ViewState>(() => resolveInitialState(props.provider))
  const [authorization, setAuthorization] = useState<ProviderAuthAuthorization | undefined>(
    undefined,
  )
  const [apiKey, setApiKey] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [cancellingOAuth, setCancellingOAuth] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [copiedCode, setCopiedCode] = useState(false)
  const oauthLaunchLockedRef = useRef(false)
  const oauthRequestIDRef = useRef(0)
  const providerRef = useRef(props.provider)

  providerRef.current = props.provider

  useEffect(() => {
    oauthRequestIDRef.current += 1
    oauthLaunchLockedRef.current = false
    if (!props.open) {
      setCancellingOAuth(false)
      return
    }
    setViewState(resolveInitialState(providerRef.current))
    setAuthorization(undefined)
    setApiKey("")
    setCode("")
    setBusy(false)
    setCancellingOAuth(false)
    setError(undefined)
    setCopiedCode(false)
  }, [props.open, props.provider.id])

  const methods = resolveMethods(props.provider)
  const hasMultipleMethods = methods.length > 1
  const envManaged = props.provider.connected && props.provider.source === "env"
  const confirmationCode = parseProviderConfirmationCode(authorization?.instructions)

  function invalidateOAuthRequest() {
    oauthRequestIDRef.current += 1
    oauthLaunchLockedRef.current = false
  }

  function isActiveOAuthRequest(requestID: number) {
    return oauthRequestIDRef.current === requestID
  }

  // Resolve where "back" should navigate to from the current state
  function resolveBackTarget(): ViewState | undefined {
    switch (viewState.kind) {
      case "method-select":
        return props.provider.connected ? { kind: "status" } : undefined
      case "api-form":
        if (hasMultipleMethods) return { kind: "method-select" }
        if (props.provider.connected) return { kind: "status" }
        return undefined
      case "oauth-start":
        if (hasMultipleMethods) return { kind: "method-select" }
        if (props.provider.connected) return { kind: "status" }
        return undefined
      case "oauth-pending": {
        if (hasMultipleMethods) return { kind: "method-select" }
        if (props.provider.connected) return { kind: "status" }
        return { kind: "oauth-start", methodIndex: viewState.methodIndex }
      }
      default:
        return undefined
    }
  }

  // Where to return after a startOAuth failure (mirrors resolveBackTarget for pending)
  function resolveOAuthFailureTarget(methodIndex: number): ViewState {
    if (hasMultipleMethods) return { kind: "method-select" }
    if (props.provider.connected) return { kind: "status" }
    return { kind: "oauth-start", methodIndex }
  }

  function resetDialogForNavigation(target: ViewState) {
    setViewState(target)
    setAuthorization(undefined)
    setApiKey("")
    setCode("")
    setError(undefined)
    setBusy(false)
    setCancellingOAuth(false)
  }

  function goBack() {
    if (viewState.kind === "oauth-pending") {
      void cancelPendingOAuth({ closeDialog: false })
      return
    }
    const target = resolveBackTarget()
    if (!target) return
    resetDialogForNavigation(target)
  }

  async function cancelPendingOAuth(options: { closeDialog: boolean }) {
    if (viewState.kind !== "oauth-pending") {
      if (options.closeDialog) {
        props.onOpenChange(false)
        return
      }
      const target = resolveBackTarget()
      if (target) resetDialogForNavigation(target)
      return
    }

    const target = resolveOAuthFailureTarget(viewState.methodIndex)
    invalidateOAuthRequest()
    setError(undefined)
    setCancellingOAuth(true)

    try {
      await cancelProviderOAuth({ providerID: props.provider.id })
    } catch {
      // Best-effort cancellation: the local flow may already be settled.
    }

    if (options.closeDialog) {
      setBusy(false)
      setCancellingOAuth(false)
      props.onOpenChange(false)
      return
    }

    resetDialogForNavigation(target)
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      props.onOpenChange(true)
      return
    }

    if (viewState.kind === "oauth-pending") {
      void cancelPendingOAuth({ closeDialog: true })
      return
    }

    props.onOpenChange(false)
  }

  async function handleCopyCode(text: string) {
    if (!text) return
    if (!("clipboard" in navigator)) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      // ignore
    }
  }

  async function disposeAndReload() {
    await reloadProviderRuntime()
    await props.onUpdated()
    props.onOpenChange(false)
  }

  async function handleApiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiKey.trim()) {
      setError(language.t("connectProviderDialog.apiKeyRequired"))
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const client = getBuddyClient()
      await client.auth.set(
        { providerID: props.provider.id, auth: { type: "api", key: apiKey.trim() } },
        { throwOnError: true },
      )
      await disposeAndReload()
    } catch (err) {
      setBusy(false)
      setError(
        formatProviderAuthError(err, language.t("connectProviderDialog.saveCredentialsFailed")),
      )
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    setError(undefined)
    try {
      await removeProviderAuth({ providerID: props.provider.id })
      const config = await loadGlobalConfig()
      if (providerNeedsConfigDisable(props.provider, config)) {
        const disabledProviders = readDisabledProviders(config)
        if (!disabledProviders.includes(props.provider.id)) {
          await patchGlobalConfig({
            [DISABLED_PROVIDERS_CONFIG_KEY]: [...disabledProviders, props.provider.id],
          })
        }
      }
      await disposeAndReload()
    } catch (err) {
      setBusy(false)
      setError(
        formatProviderAuthError(err, language.t("connectProviderDialog.removeCredentialsFailed")),
      )
    }
  }

  async function startOAuth(targetMethodIndex: number) {
    if (oauthLaunchLockedRef.current) return
    oauthLaunchLockedRef.current = true
    const requestID = oauthRequestIDRef.current + 1
    oauthRequestIDRef.current = requestID
    setBusy(true)
    setError(undefined)
    setAuthorization(undefined)
    setCode("")
    try {
      const nextAuthorization = await authorizeProviderOAuth({
        providerID: props.provider.id,
        methodIndex: targetMethodIndex,
      })
      if (!isActiveOAuthRequest(requestID)) return
      if (!nextAuthorization) {
        setBusy(false)
        return
      }
      setAuthorization(nextAuthorization)
      setViewState({ kind: "oauth-pending", methodIndex: targetMethodIndex })
      platform.openLink(nextAuthorization.url)
      if (nextAuthorization.method === "auto") {
        await completeProviderOAuth({
          providerID: props.provider.id,
          methodIndex: targetMethodIndex,
        })
        if (!isActiveOAuthRequest(requestID)) return
        await disposeAndReload()
        return
      }
      setBusy(false)
    } catch (err) {
      if (!isActiveOAuthRequest(requestID)) return
      if (isProviderAuthFlowInterrupted(err)) {
        setBusy(false)
        setAuthorization(undefined)
        setViewState(resolveOAuthFailureTarget(targetMethodIndex))
        return
      }
      setBusy(false)
      setAuthorization(undefined)
      setViewState(resolveOAuthFailureTarget(targetMethodIndex))
      setError(
        formatProviderAuthError(err, language.t("connectProviderDialog.startProviderLoginFailed")),
      )
    } finally {
      if (isActiveOAuthRequest(requestID)) {
        oauthLaunchLockedRef.current = false
      }
    }
  }

  async function submitOAuthCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (viewState.kind !== "oauth-pending") return
    if (!code.trim()) {
      setError(language.t("connectProviderDialog.authCodeRequired"))
      return
    }
    const requestID = oauthRequestIDRef.current
    setBusy(true)
    setError(undefined)
    try {
      await completeProviderOAuth({
        providerID: props.provider.id,
        methodIndex: viewState.methodIndex,
        code: code.trim(),
      })
      if (!isActiveOAuthRequest(requestID)) return
      await disposeAndReload()
    } catch (err) {
      if (!isActiveOAuthRequest(requestID)) return
      if (isProviderAuthFlowInterrupted(err)) {
        setBusy(false)
        return
      }
      setBusy(false)
      setError(formatProviderAuthError(err, language.t("connectProviderDialog.invalidAuthCode")))
    }
  }

  function renderBody() {
    switch (viewState.kind) {
      case "status": {
        const isSingleApiMethod = !hasMultipleMethods && methods[0]?.type === "api"
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border-success-base/30 bg-surface-success-base/5 p-4">
              <CircleCheckIcon className="size-4 text-icon-success-base shrink-0" />
              <p className="text-sm font-medium text-icon-success-base">
                {language.t("connectProviderDialog.connected")}
              </p>
            </div>
            {envManaged ? (
              <p className="text-sm text-text-weak text-center">
                {language.t("connectProviderDialog.envDisconnectHelp")}
              </p>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setViewState(resolveReconnectTarget(props.provider))}
                  disabled={busy || cancellingOAuth}
                >
                  {isSingleApiMethod
                    ? language.t("connectProviderDialog.updateApiKey")
                    : language.t("connectProviderDialog.reconnect")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => void handleDisconnect()}
                  disabled={busy || cancellingOAuth}
                >
                  {language.t("connectProviderDialog.disconnect")}
                </Button>
              </div>
            )}
          </div>
        )
      }

      case "method-select":
        return (
          <div className="space-y-2">
            {methods.map((method, index) => (
              <Button
                key={`${method.type}:${method.label}`}
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={busy || cancellingOAuth}
                onClick={() => {
                  if (method.type === "oauth") {
                    void startOAuth(index)
                  } else {
                    setViewState({ kind: "api-form" })
                  }
                }}
              >
                {method.label}
              </Button>
            ))}
          </div>
        )

      case "api-form":
        return (
          <form className="space-y-4" onSubmit={(event) => void handleApiSubmit(event)}>
            <div className="space-y-1.5">
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={language.t("connectProviderDialog.apiKeyPlaceholder", {
                  providerName: props.provider.name,
                })}
                disabled={busy || cancellingOAuth}
              />
            </div>
            <Button className="w-full" type="submit" disabled={busy || cancellingOAuth}>
              {busy
                ? language.t("common.saving")
                : language.t("connectProviderDialog.saveCredentials")}
            </Button>
          </form>
        )

      case "oauth-start":
        return (
          <Button
            className="w-full"
            onClick={() => void startOAuth(viewState.methodIndex)}
            disabled={busy || cancellingOAuth}
          >
            {busy
              ? language.t("connectProviderDialog.waitingForAuthorization")
              : language.t("connectProviderDialog.startLogin")}
          </Button>
        )

      case "oauth-pending": {
        if (!authorization) return null
        return (
          <div className="space-y-4">
            <a
              className="inline-flex text-sm text-text-interactive-base underline underline-offset-4 hover:opacity-80 transition-opacity cursor-pointer"
              href={authorization.url}
              target="_blank"
              rel="noreferrer"
            >
              {language.t("connectProviderDialog.clickToOpenAgain")}
            </a>

            {authorization.method === "code" ? (
              <form className="space-y-4" onSubmit={(event) => void submitOAuthCode(event)}>
                <div className="space-y-1.5">
                  <label className="text-sm text-text-weak">
                    {language.t("connectProviderDialog.authorizationCodeLabel")}
                  </label>
                  <Input
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder={language.t("connectProviderDialog.authorizationCodePlaceholder")}
                    disabled={busy || cancellingOAuth}
                  />
                </div>
                <Button className="w-full" type="submit" disabled={busy || cancellingOAuth}>
                  {busy
                    ? language.t("connectProviderDialog.continueInBrowser")
                    : language.t("connectProviderDialog.submitCode")}
                </Button>
              </form>
            ) : (
              <div className="space-y-2">
                {confirmationCode ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-text-weak">
                      {language.t("connectProviderDialog.confirmationCodeLabel")}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(confirmationCode)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-base bg-surface-base px-3 py-2 text-left font-mono text-sm transition-colors hover:bg-surface-raised-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base cursor-pointer"
                    >
                      <span className="select-all tracking-wider text-text-strong">
                        {confirmationCode}
                      </span>
                      {copiedCode ? (
                        <CircleCheckIcon className="size-4 shrink-0 text-text-success-base" />
                      ) : (
                        <CopyIcon className="size-4 shrink-0 text-text-weak" />
                      )}
                    </button>
                  </div>
                ) : null}
                <p className="text-sm text-text-weak animate-pulse">
                  {language.t("connectProviderDialog.waitingForAuthorization")}
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => void cancelPendingOAuth({ closeDialog: true })}
              disabled={cancellingOAuth || (authorization.method === "code" && busy)}
            >
              {language.t("common.cancel")}
            </Button>
          </div>
        )
      }
    }
  }

  function resolveDescription(): React.ReactNode {
    switch (viewState.kind) {
      case "status":
        return undefined
      case "method-select":
        return language.t("connectProviderDialog.description")
      default:
        return null
    }
  }

  const backTarget = resolveBackTarget()
  const description = resolveDescription()

  return (
    <Dialog open={props.open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-sm">
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-1">
            {backTarget ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-ml-1 shrink-0"
                onClick={goBack}
                disabled={busy || cancellingOAuth}
              >
                <ChevronLeftIcon />
              </Button>
            ) : null}
            <DialogTitle>{props.provider.name}</DialogTitle>
          </div>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-4 py-1">
          {renderBody()}
          {error ? (
            <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-sm text-icon-critical-base">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
