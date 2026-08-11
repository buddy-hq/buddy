import { useState } from "react"
import {
  Button,
  Input,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@buddy/ui"
import { AlertCircle, ArrowLeft, CheckCircle2, Globe, KeyRound } from "@/icons/app-icons"

type ConnectionMethod = {
  type: "oauth" | "api"
  label: string
}

type ProviderInfo = {
  id: string
  name: string
  connected: boolean
  source: "user" | "env"
  methods: ConnectionMethod[]
}

type ActiveScreen = "select-method" | "config-form" | "success"

export function ProviderDialogPlayground() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("select-method")
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<ConnectionMethod | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [simResult, setSimResult] = useState<"success" | "error">("success")

  // Mock list of providers matching real backend schema
  const [providers, setProviders] = useState<ProviderInfo[]>([
    {
      id: "openai",
      name: "OpenAI",
      connected: false,
      source: "user",
      methods: [
        { type: "oauth", label: "Browser Console Login" },
        { type: "api", label: "Custom API Key" },
      ],
    },
    {
      id: "github",
      name: "GitHub",
      connected: true,
      source: "env",
      methods: [
        { type: "oauth", label: "Browser OAuth Sync" },
        { type: "api", label: "Personal Access Token" },
      ],
    },
    {
      id: "anthropic",
      name: "Anthropic",
      connected: false,
      source: "user",
      methods: [
        { type: "oauth", label: "Developer SSO Console" },
        { type: "api", label: "Access Token API" },
      ],
    },
  ])

  function handleEditConnection(provider: ProviderInfo) {
    setSelectedProvider(provider)
    setSelectedMethod(null)
    setError(null)
    setBusy(false)
    setApiKey("")
    setCode("")
    setDialogOpen(true)

    // If there is only 1 way to connect, skip step 1
    if (provider.methods.length === 1) {
      setSelectedMethod(provider.methods[0] ?? null)
      setActiveScreen("config-form")
    } else {
      setActiveScreen("select-method")
    }
  }

  function handleSelectMethod(method: ConnectionMethod) {
    setSelectedMethod(method)
    setError(null)
    setBusy(false)
    setActiveScreen("config-form")
  }

  function handleGoBack() {
    setError(null)
    setActiveScreen("select-method")
  }

  function handleClose() {
    setDialogOpen(false)
    setSelectedProvider(null)
    setSelectedMethod(null)
    setError(null)
  }

  function handleVerifySubmit() {
    if (!selectedProvider || !selectedMethod) return

    setBusy(true)
    setError(null)

    setTimeout(() => {
      setBusy(false)
      if (simResult === "success") {
        setProviders((prev) =>
          prev.map((p) => {
            if (p.id === selectedProvider.id) {
              return { ...p, connected: true, source: "user" }
            }
            return p
          }),
        )
        setActiveScreen("success")
      } else {
        setError("Verification Failed: Authentication token is invalid or has expired.")
      }
    }, 1200)
  }

  function handleDisconnect() {
    if (!selectedProvider) return
    setBusy(true)
    setError(null)

    setTimeout(() => {
      setBusy(false)
      setProviders((prev) =>
        prev.map((p) => {
          if (p.id === selectedProvider.id) {
            return { ...p, connected: false, source: "user" }
          }
          return p
        }),
      )
      handleClose()
    }, 1000)
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3 space-y-4 overflow-y-auto">
      {/* Simulation Controls Bar */}
      <div className="rounded-lg border border-border-base bg-background-base p-3 space-y-2 flex-shrink-0">
        <p className="text-xs font-semibold text-text-weak uppercase tracking-wider">
          Playground Test Controls
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-weak">Simulation Outcome:</span>
          <div className="flex bg-slate-800 p-0.5 rounded border border-slate-700">
            <button
              type="button"
              onClick={() => setSimResult("success")}
              className={`px-2.5 py-1 text-xs rounded transition-all ${simResult === "success" ? "bg-emerald-600 text-white font-medium shadow" : "text-slate-400 hover:text-slate-205"}`}
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => setSimResult("error")}
              className={`px-2.5 py-1 text-xs rounded transition-all ${simResult === "error" ? "bg-rose-600 text-white font-medium shadow" : "text-slate-400 hover:text-slate-205"}`}
            >
              Error
            </button>
          </div>
        </div>
      </div>

      {/* Mock Dashboard Area */}
      <div className="flex-1 min-h-0 flex items-start justify-center">
        <Card className="w-full">
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-text-base font-glass">
                Notebook Services Catalog
              </p>
              <p className="text-xs text-text-weak leading-relaxed">
                Choose an integration platform connection to configure.
              </p>
            </div>

            <div className="space-y-2">
              {providers.map((p) => {
                const isConnected = p.connected
                const isEnv = p.source === "env"
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border-weaker-base bg-background-base/50"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-base">{p.name}</p>
                      <span className="text-[10px] text-text-weaker block mt-0.5">
                        {isConnected
                          ? isEnv
                            ? "Connected via Environment variables"
                            : "Connected"
                          : "Disconnected"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleEditConnection(p)}
                    >
                      Edit Connection
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ACTUAL DIALOG modal OVERLAY CONTAINER */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md h-[400px] flex flex-col justify-between overflow-hidden">
          {/* Actual Hierarchy: DialogHeader, DialogTitle are direct children of DialogContent */}
          <DialogHeader>
            <DialogTitle>
              {selectedProvider
                ? activeScreen === "select-method"
                  ? `Connect ${selectedProvider.name}`
                  : activeScreen === "config-form" && selectedMethod
                    ? `Connect ${selectedProvider.name} via ${selectedMethod.label}`
                    : "Linked Successfully"
                : "Connect Provider"}
            </DialogTitle>
            {activeScreen === "success" && selectedProvider && (
              <DialogDescription>
                Your notebooks can now query {selectedProvider.name}.
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Dialog Body - Scrollable and Flex-grow middle container */}
          <div className="flex-1 overflow-y-auto min-h-0 py-2">
            {/* DIALOG VIEW: STEP 1 (Connection options layout) */}
            {activeScreen === "select-method" && selectedProvider && (
              <div className="space-y-2">
                {selectedProvider.methods.map((m) => {
                  return (
                    <div
                      key={`${m.type}:${m.label}`}
                      onClick={() => handleSelectMethod(m)}
                      className="border border-border-weaker-base bg-background-base/50 hover:bg-background-base/80 p-3 rounded-lg cursor-pointer transition-all flex items-start gap-2.5 group"
                    >
                      <div className="mt-0.5 text-text-weak group-hover:text-text-base">
                        {m.type === "oauth" ? (
                          <Globe className="size-4" />
                        ) : (
                          <KeyRound className="size-4" />
                        )}
                      </div>
                      <div className="self-center">
                        <p className="text-xs font-bold text-text-base group-hover:text-text-interactive-base">
                          {m.label}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* DIALOG VIEW: STEP 2 (Configuration Form - Flat minimal input layout) */}
            {activeScreen === "config-form" && selectedProvider && selectedMethod && (
              <div className="space-y-4">
                {error && (
                  <div className="flex gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs leading-normal">
                    <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {selectedMethod.type === "api" && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-text-weak">API Key Secret</label>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Enter API Key for ${selectedProvider.name}`}
                      disabled={busy}
                    />
                  </div>
                )}

                {/* Headless confirmation code flow: triggered for OpenAI OAuth handshake */}
                {selectedMethod.type === "oauth" && selectedProvider.id === "openai" && (
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-xs text-text-weak">Confirmation Code</p>
                    <Input
                      readOnly
                      value="7721-AC8E-SYNC"
                      className="font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>
                )}

                {/* Standard OAuth code input flow: triggered for other OAuth services */}
                {selectedMethod.type === "oauth" && selectedProvider.id !== "openai" && (
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <p className="text-xs text-text-weak">Handshake URL</p>
                      <a
                        href={`https://${selectedProvider.id}.com/oauth`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-text-interactive-base underline-offset-4 hover:underline block truncate"
                      >
                        https://{selectedProvider.id}.com/oauth/authorize?client=buddy
                      </a>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-text-weak">Authorization Code</label>
                      <Input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Enter authorization code"
                        disabled={busy}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SUCCESS VIEW - Clean flat data display */}
            {activeScreen === "success" && selectedProvider && selectedMethod && (
              <div className="flex flex-col justify-center space-y-5 py-2 h-full text-center">
                <CheckCircle2 className="size-12 text-text-success-base mx-auto animate-in zoom-in-50 duration-300" />

                <div className="text-left text-xs space-y-2 w-full px-1">
                  <div className="flex justify-between border-b border-border-weaker-base/40 pb-1.5">
                    <span className="text-text-weak">Provider:</span>
                    <span className="font-bold text-text-base">{selectedProvider.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-weak">Connection:</span>
                    <span className="font-bold text-text-base">{selectedMethod.label}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DialogFooter */}
          <DialogFooter>
            {activeScreen === "select-method" && (
              <>
                <span className="text-[11px] text-text-weaker mr-auto self-center">
                  Step 1 of 2
                </span>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleClose}>
                  Cancel
                </Button>
              </>
            )}

            {activeScreen === "config-form" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGoBack}
                  disabled={busy || !!(selectedProvider && selectedProvider.methods.length === 1)}
                  className="gap-1 px-2.5 h-8 text-xs mr-auto"
                >
                  <ArrowLeft className="size-3.5" />
                  Method
                </Button>

                <div className="flex gap-2">
                  {selectedProvider &&
                    selectedProvider.connected &&
                    selectedProvider.source !== "env" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handleDisconnect}
                        disabled={busy}
                      >
                        Disconnect
                      </Button>
                    )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleVerifySubmit}
                    disabled={busy}
                  >
                    {busy ? "Verifying..." : "Verify Connection"}
                  </Button>
                </div>
              </>
            )}

            {activeScreen === "success" && (
              <Button type="button" className="w-full h-8 text-xs" onClick={handleClose}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
