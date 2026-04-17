import { type ReactNode, useMemo, useRef, useState } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CheckIcon,
  ChevronDownIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogTitle,
  Separator,
  cn,
} from "@buddy/ui"
import { ConnectProviderDialog } from "@/components/connect-provider-dialog"
import { ProviderIcon } from "@/components/provider-icon"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { connectChatGptPlusForOnboarding } from "@/lib/onboarding-flow"
import { OPENCODE_PROVIDER_ID, OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import {
  authorizeProviderOAuth,
  completeProviderOAuth,
  formatProviderAuthError,
  reloadProviderRuntime,
} from "@/lib/provider-auth"
import { loadProviderCatalogSnapshot } from "@/state/chat-actions"
import type { ProviderInfo } from "@/state/chat-types"
import { useProjectSettings } from "@/state/project-settings"
import { ProviderSourceBadge, SettingsListCard, SettingsContent } from "./settings-primitives"

type RecommendedProviderCardProps = {
  provider?: ProviderInfo
  title: string
  description: string
  iconID: string
  connectLabel: string
  unavailableLabel: string
  busy?: boolean
  error?: string
  onConnect: () => void
  onManage: () => void
}

function ProviderSection(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-base">{props.title}</h3>
        {props.action}
      </div>
      {props.children}
    </section>
  )
}

function RecommendedProviderCard(props: RecommendedProviderCardProps) {
  const connected = Boolean(props.provider?.connected)
  const unavailable = !props.provider

  return (
    <Card
      className={cn(
        "border-border-base/80 transition-colors",
        connected
          ? "bg-surface-success-base/10"
          : "bg-surface-raised-base hover:border-border-interactive-base/70",
      )}
    >
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-2xl border",
                connected
                  ? "border-border-success-base bg-surface-success-base/10 text-text-success-base"
                  : "border-border-base bg-background-base text-text-base",
              )}
            >
              <ProviderIcon id={props.iconID} className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text-base">{props.title}</p>
                {connected ? (
                  <Badge variant="outline" className="h-5 gap-1 border-border-success-base">
                    <CheckIcon className="size-3.5" />
                    {language.t("onboardingSetup.engineSelection.connected")}
                  </Badge>
                ) : null}
                {unavailable ? (
                  <Badge variant="outline" className="h-5">
                    {props.unavailableLabel}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-text-weak">{props.description}</p>
            </div>
          </div>
          {props.provider ? <ProviderSourceBadge provider={props.provider} /> : null}
        </div>

        {props.error ? (
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
            {props.error}
          </p>
        ) : null}

        <div className="mt-auto flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="min-w-[9rem]"
            disabled={unavailable || props.busy}
            onClick={connected ? props.onManage : props.onConnect}
          >
            {connected
              ? language.t("settings.providers.editConnection")
              : props.busy
                ? language.t("onboardingSetup.chatGptModal.waitingLabel")
                : props.connectLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ProviderListRow(props: {
  provider: ProviderInfo
  connected: boolean
  last: boolean
  onOpenDialog: (providerID: string) => void
}) {
  return (
    <div
      data-component="settings-provider-item"
      data-provider-id={props.provider.id}
      data-connected={props.connected ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 overflow-hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border-base bg-background-base">
            <ProviderIcon id={props.provider.id} className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="truncate text-sm font-medium text-text-base">
                {props.provider.name}
              </span>
              {props.connected ? <ProviderSourceBadge provider={props.provider} /> : null}
            </div>
            {!props.connected && props.provider.methods.length > 0 ? (
              <span className="mt-0.5 hidden truncate text-xs text-text-weak sm:inline-block">
                {props.provider.methods.map((method) => method.label).join(" • ")}
              </span>
            ) : null}
          </div>
        </div>

        <Button
          data-action={
            props.connected
              ? `settings-provider-edit-${props.provider.id}`
              : `settings-provider-connect-${props.provider.id}`
          }
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0 active:scale-[0.97] transition-all duration-150 ease-out"
          onClick={() => props.onOpenDialog(props.provider.id)}
        >
          {props.connected
            ? language.t("settings.providers.editConnection")
            : language.t("common.connect")}
        </Button>
      </div>
      {props.last ? null : <Separator />}
    </div>
  )
}

export function ProvidersSettings({ directory }: { directory: string }) {
  const platform = usePlatform()
  const settings = useProjectSettings(directory, true)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerDialogTarget, setProviderDialogTarget] = useState<string | undefined>(undefined)
  const [allProvidersOpen, setAllProvidersOpen] = useState(false)
  const [chatGptConnecting, setChatGptConnecting] = useState(false)
  const [chatGptWaitingOpen, setChatGptWaitingOpen] = useState(false)
  const [chatGptErrorState, setChatGptError] = useState<string | undefined>(undefined)
  const latestChatGptRequestRef = useRef(0)
  const dismissedChatGptRequestRef = useRef<number | undefined>(undefined)

  const providersByID = useMemo(
    () => new Map(settings.options.allProviders.map((provider) => [provider.id, provider])),
    [settings.options.allProviders],
  )
  const chatGptProvider = providersByID.get(OPENAI_PROVIDER_ID)
  const openCodeGoProvider = providersByID.get(OPENCODE_PROVIDER_ID)
  const allProviders = useMemo(
    () => settings.options.allProviders.filter((provider) => !provider.connected),
    [settings.options.allProviders],
  )
  const chatGptError = chatGptProvider?.connected ? undefined : chatGptErrorState

  function openProviderDialog(initialProvider?: string) {
    setProviderDialogTarget(initialProvider)
    setProviderDialogOpen(true)
  }

  async function handleProvidersUpdated() {
    await settings.actions.refresh()
  }

  async function handleConnectChatGpt() {
    if (!chatGptProvider) return

    const requestID = latestChatGptRequestRef.current + 1
    latestChatGptRequestRef.current = requestID
    dismissedChatGptRequestRef.current = undefined
    setChatGptConnecting(true)
    setChatGptWaitingOpen(true)
    setChatGptError(undefined)

    try {
      await connectChatGptPlusForOnboarding({
        openLink: (url) => platform.openLink(url),
        loadProviderCatalogSnapshot: () => loadProviderCatalogSnapshot(directory),
        authorizeProviderOAuth: ({ providerID, methodIndex }) =>
          authorizeProviderOAuth({ directory, providerID, methodIndex }),
        completeProviderOAuth: ({ providerID, methodIndex }) =>
          completeProviderOAuth({ directory, providerID, methodIndex }),
        reloadProviderRuntime: () => reloadProviderRuntime(directory),
      })
      await handleProvidersUpdated()
      setChatGptError(undefined)
    } catch (error) {
      if (dismissedChatGptRequestRef.current === requestID) {
        return
      }

      setChatGptError(formatProviderAuthError(error, language.t("routes.onboarding.signInFailed")))
    } finally {
      if (latestChatGptRequestRef.current === requestID) {
        setChatGptConnecting(false)
        setChatGptWaitingOpen(false)
      }
    }
  }

  function dismissChatGptWaiting() {
    dismissedChatGptRequestRef.current = latestChatGptRequestRef.current
    setChatGptWaitingOpen(false)
  }

  return (
    <>
      <SettingsContent>
        {settings.options.providers.length > 0 ? (
          <ProviderSection title={language.t("settings.providers.connectedSection")}>
            <SettingsListCard>
              {settings.options.providers.map((provider, index) => (
                <ProviderListRow
                  key={provider.id}
                  provider={provider}
                  connected
                  last={index === settings.options.providers.length - 1}
                  onOpenDialog={openProviderDialog}
                />
              ))}
            </SettingsListCard>
          </ProviderSection>
        ) : null}

        <ProviderSection title={language.t("settings.providers.recommendedSection")}>
          <div className="grid gap-3 md:grid-cols-2">
            <RecommendedProviderCard
              provider={chatGptProvider}
              title={language.t("settings.providers.chatGptTitle")}
              description={language.t("settings.providers.chatGptDescription")}
              iconID={OPENAI_PROVIDER_ID}
              connectLabel={language.t("settings.providers.connectChatGpt")}
              unavailableLabel={language.t("settings.providers.unavailable")}
              busy={chatGptConnecting}
              error={chatGptError}
              onConnect={() => {
                void handleConnectChatGpt()
              }}
              onManage={() => openProviderDialog(OPENAI_PROVIDER_ID)}
            />
            <RecommendedProviderCard
              provider={openCodeGoProvider}
              title={language.t("settings.providers.openCodeGoTitle")}
              description={language.t("settings.providers.openCodeGoDescription")}
              iconID={OPENCODE_PROVIDER_ID}
              connectLabel={language.t("common.connect")}
              unavailableLabel={language.t("settings.providers.unavailable")}
              onConnect={() => openProviderDialog(OPENCODE_PROVIDER_ID)}
              onManage={() => openProviderDialog(OPENCODE_PROVIDER_ID)}
            />
          </div>
        </ProviderSection>

        <Collapsible
          open={allProvidersOpen}
          onOpenChange={setAllProvidersOpen}
          className="space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.providers.allProvidersSection")}
            </h3>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-action="settings-providers-toggle-all"
                className="gap-2"
              >
                {allProvidersOpen
                  ? language.t("settings.providers.hideAllProviders")
                  : language.t("settings.providers.showAllProviders")}
                <ChevronDownIcon
                  className={cn(
                    "size-4 transition-transform",
                    allProvidersOpen ? "rotate-180" : "rotate-0",
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <SettingsListCard>
              {allProviders.length > 0 ? (
                allProviders.map((provider, index) => (
                  <ProviderListRow
                    key={provider.id}
                    provider={provider}
                    connected={false}
                    last={index === allProviders.length - 1}
                    onOpenDialog={openProviderDialog}
                  />
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-text-weak">
                  {language.t("settings.providers.allConnected")}
                </div>
              )}
            </SettingsListCard>
          </CollapsibleContent>
        </Collapsible>
      </SettingsContent>

      <Dialog
        open={chatGptWaitingOpen}
        onOpenChange={(open) => {
          if (!open) {
            dismissChatGptWaiting()
          }
        }}
      >
        <DialogContent className="max-w-sm border-border-base bg-surface-base p-8 text-center">
          <div className="flex flex-col items-center">
            <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base bg-surface-success-base/10">
              <ProviderIcon
                id={OPENAI_PROVIDER_ID}
                className="size-6 animate-pulse text-text-success-base"
              />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-text-strong">
              {language.t("onboardingSetup.chatGptModal.title")}
            </DialogTitle>
            <p className="mt-2 text-sm leading-relaxed text-text-weak">
              {language.t("onboardingSetup.chatGptModal.description")}
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base bg-surface-success-base/10 px-4 py-2 text-[13px] font-semibold text-text-success-base">
              <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {language.t("onboardingSetup.chatGptModal.waitingLabel")}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-8 w-full rounded-xl"
              onClick={dismissChatGptWaiting}
            >
              {language.t("onboardingSetup.chatGptModal.cancelButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConnectProviderDialog
        directory={directory}
        open={providerDialogOpen}
        providers={settings.options.allProviders}
        initialProvider={providerDialogTarget}
        onOpenChange={setProviderDialogOpen}
        onUpdated={handleProvidersUpdated}
      />
    </>
  )
}
