import { type ReactNode, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Badge,
  Button,
  CheckIcon,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Progress,
  Separator,
  cn,
} from "@buddy/ui"
import { Loader2Icon, RefreshCwIcon } from "@/icons/app-icons"
import { ConnectProviderDialog } from "@/components/connect-provider-dialog"
import { ProviderIcon } from "@/components/provider-icon"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { connectChatGptPlusForOnboarding } from "@/lib/onboarding-flow"
import { getConnectedProviders } from "@/lib/provider-catalog"
import { resolveProviderSearchResults } from "@/lib/provider-search"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import {
  authorizeProviderOAuth,
  completeProviderOAuth,
  formatProviderAuthError,
  reloadProviderRuntime,
} from "@/lib/provider-auth"
import { loadProviderCatalog, loadProviderCatalogSnapshot } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { ProviderCatalogState, ProviderInfo } from "@/state/chat-types"
import {
  invalidateAllProviderCatalogSnapshotQueries,
  providerCatalogSnapshotQueryOptions,
} from "@/state/bootstrap-query"
import {
  openAIUsageQueryOptions,
  resetOpenAIUsageQuery,
  refreshOpenAIModelAvailability,
  refreshOpenAIUsage,
  type OpenAIUsageSnapshot,
} from "@/state/openai-usage-query"
import { ProviderSourceBadge, SettingsListCard, SettingsContent } from "./settings-primitives"

const OPENCODE_GO_PROVIDER_ID = "opencode-go"
const OPENCODE_GO_LEARN_MORE_URL = "https://opencode.ai/go"
const CHATGPT_LEARN_MORE_URL = "https://chatgpt.com/pricing/"
const PROVIDER_SEARCH_VISIBLE_THRESHOLD = 3
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

type ReadyOpenAIUsage = Extract<OpenAIUsageSnapshot, { status: "ready" }>
type OpenAIUsageWindow = NonNullable<ReadyOpenAIUsage["rateLimit"]["primary"]>

type RecommendedProviderDefinition = {
  providerID: string
  title: string
  description: string
  iconID: string
  connectLabel: string
  learnMoreHref?: string
  learnMoreLabel?: string
}

type RecommendedProviderCardProps = {
  provider?: ProviderInfo
  title: string
  description: string
  iconID: string
  connectLabel: string
  learnMoreHref?: string
  learnMoreLabel?: string
  unavailableLabel: string
  busy?: boolean
  error?: string
  onConnect: () => void
  onManage: () => void
}

type ChatGptAccountCardProps = {
  modelAvailability: ProviderCatalogState["openAIModelAvailability"]
  usage: OpenAIUsageSnapshot | undefined
  error?: string
  usageLoading: boolean
  refreshing: boolean
  reconnecting: boolean
  reconnectRequired: boolean
  onManage: () => void
  onReconnect: () => void
  onRefresh: () => void
}

const RECOMMENDED_PROVIDER_DEFINITIONS: RecommendedProviderDefinition[] = [
  {
    providerID: OPENAI_PROVIDER_ID,
    title: language.t("settings.providers.chatGptTitle"),
    description: language.t("settings.providers.chatGptDescription"),
    iconID: OPENAI_PROVIDER_ID,
    connectLabel: language.t("common.connect"),
    learnMoreHref: CHATGPT_LEARN_MORE_URL,
    learnMoreLabel: language.t("settings.providers.learnMore"),
  },
  {
    providerID: OPENCODE_GO_PROVIDER_ID,
    title: language.t("settings.providers.openCodeGoTitle"),
    description: language.t("settings.providers.openCodeGoDescription"),
    iconID: OPENCODE_GO_PROVIDER_ID,
    connectLabel: language.t("common.connect"),
    learnMoreHref: OPENCODE_GO_LEARN_MORE_URL,
    learnMoreLabel: language.t("settings.providers.learnMore"),
  },
]

export function resolveRecommendedProviderCards(allProviders: ProviderInfo[]) {
  const providersByID = new Map(allProviders.map((provider) => [provider.id, provider]))

  return RECOMMENDED_PROVIDER_DEFINITIONS.flatMap((definition) => {
    const provider = providersByID.get(definition.providerID)
    if (provider?.connected) return []
    if (!provider) return []
    return [provider]
  })
}

export function resolveAvailableProviders(allProviders: ProviderInfo[]) {
  return allProviders
    .filter((provider) => !provider.connected)
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

export function resolveProviderListRowAction(provider: ProviderInfo, connected: boolean) {
  if (!connected) return "connect"
  return "edit"
}

export function resolveProviderListRowControls(provider: ProviderInfo, connected: boolean) {
  if (!connected) {
    return {
      showConnect: true,
      showDisconnect: false,
      showEdit: false,
      showEnvNote: false,
    }
  }

  const envManaged = provider.source === "env"
  return {
    showConnect: false,
    showDisconnect: false,
    showEdit: true,
    showEnvNote: envManaged,
  }
}

export function formatChatGptPlan(plan: string | null | undefined) {
  if (!plan) return ""

  return plan
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (lower === "k12") return "K12"
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`
    })
    .join(" ")
}

export function formatUsageWindowLabel(windowSeconds: number) {
  const totalMinutes = Math.max(1, Math.round(windowSeconds / SECONDS_PER_MINUTE))
  const totalHours = totalMinutes / MINUTES_PER_HOUR
  const totalDays = totalHours / HOURS_PER_DAY

  if (Number.isInteger(totalDays)) {
    return `${totalDays}-day limit`
  }
  if (Number.isInteger(totalHours)) {
    return `${totalHours}-hour limit`
  }
  return `${totalMinutes}-minute limit`
}

export function formatRelativeTime(timestamp: string, now = Date.now()) {
  const target = Date.parse(timestamp)
  if (!Number.isFinite(target)) return timestamp

  const differenceMinutes = Math.round((target - now) / (SECONDS_PER_MINUTE * 1_000))
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const absoluteMinutes = Math.abs(differenceMinutes)
  if (absoluteMinutes < MINUTES_PER_HOUR) {
    return formatter.format(differenceMinutes, "minute")
  }

  const differenceHours = Math.round(differenceMinutes / MINUTES_PER_HOUR)
  if (Math.abs(differenceHours) < HOURS_PER_DAY) {
    return formatter.format(differenceHours, "hour")
  }

  return formatter.format(Math.round(differenceHours / HOURS_PER_DAY), "day")
}

export function resolveUsageRemainingPercent(usedPercent: number) {
  return 100 - Math.max(0, Math.min(usedPercent, 100))
}

export function isChatGptReconnectRequired(input: {
  modelAvailability: ProviderCatalogState["openAIModelAvailability"]
  usage: OpenAIUsageSnapshot | undefined
}) {
  return (
    input.modelAvailability.status === "reconnect_required" ||
    input.usage?.status === "reconnect_required"
  )
}

export function resolveChatGptAuthErrorSurfaces(input: {
  connected: boolean
  error: string | undefined
}) {
  return input.connected
    ? { accountError: input.error, availableError: undefined }
    : { accountError: undefined, availableError: input.error }
}

function UsageWindow(props: { window: OpenAIUsageWindow }) {
  const remainingPercent = resolveUsageRemainingPercent(props.window.usedPercent)

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border-base/60 bg-background-base px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-text-base">
          {formatUsageWindowLabel(props.window.windowSeconds)}
        </span>
        <span className="text-xs text-text-weak">
          {language.t("settings.providers.chatGptUsageRemaining", {
            percent: Math.round(remainingPercent),
          })}
        </span>
      </div>
      <Progress
        value={remainingPercent}
        aria-label={formatUsageWindowLabel(props.window.windowSeconds)}
      />
      <span className="text-[11px] text-text-weaker">
        {language.t("settings.providers.chatGptUsageResets", {
          time: formatRelativeTime(props.window.resetsAt),
        })}
      </span>
    </div>
  )
}

function ChatGptAccountCard(props: ChatGptAccountCardProps) {
  const readyUsage =
    !props.reconnectRequired && props.usage?.status === "ready" ? props.usage : undefined
  const modelDescription = props.reconnectRequired
    ? language.t("settings.providers.chatGptReconnectDescription")
    : props.modelAvailability.status === "ready"
      ? language.t("settings.providers.chatGptModelsAvailable", {
          count: props.modelAvailability.modelIDs.length,
        })
      : props.modelAvailability.status === "loading"
        ? language.t("settings.providers.chatGptModelsChecking")
        : language.t("settings.providers.chatGptModelsFallback")
  const windows = readyUsage
    ? [readyUsage.rateLimit.primary, readyUsage.rateLimit.secondary].filter(
        (window): window is OpenAIUsageWindow => Boolean(window),
      )
    : []

  return (
    <SettingsListCard>
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                props.reconnectRequired
                  ? "border-border-critical-base bg-surface-critical-base/10"
                  : "border-border-success-base bg-surface-success-base/10",
              )}
            >
              <ProviderIcon
                id={OPENAI_PROVIDER_ID}
                className={cn(
                  "size-5",
                  props.reconnectRequired ? "text-icon-critical-base" : "text-text-success-base",
                )}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text-base">
                  {language.t("settings.providers.chatGptTitle")}
                </p>
                <Badge
                  variant="outline"
                  className={
                    props.reconnectRequired
                      ? "border-border-critical-base text-icon-critical-base"
                      : undefined
                  }
                >
                  {props.reconnectRequired
                    ? language.t("settings.providers.chatGptReconnectRequired")
                    : readyUsage?.plan
                    ? language.t("settings.providers.chatGptPlan", {
                        plan: formatChatGptPlan(readyUsage.plan),
                      })
                    : language.t("onboardingSetup.engineSelection.connected")}
                </Badge>
              </div>
              <p className="text-xs text-text-weak">{modelDescription}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {props.reconnectRequired ? null : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={language.t("settings.providers.refreshChatGpt")}
                onClick={props.onRefresh}
                disabled={props.refreshing}
              >
                {props.refreshing ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" />
                )}
                {language.t("common.refresh")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={props.reconnectRequired ? props.onReconnect : props.onManage}
              disabled={props.reconnecting}
            >
              {props.reconnecting ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : null}
              {props.reconnectRequired
                ? language.t("connectProviderDialog.reconnect")
                : language.t("settings.providers.editConnection")}
            </Button>
          </div>
        </div>

        {props.error ? (
          <p
            role="alert"
            className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base"
          >
            {props.error}
          </p>
        ) : null}

        {props.reconnectRequired ? null : props.usageLoading && !props.usage ? (
          <div className="flex items-center gap-2 text-xs text-text-weak">
            <Loader2Icon className="size-4 animate-spin" />
            {language.t("settings.providers.chatGptUsageLoading")}
          </div>
        ) : props.usage?.status === "error" ? (
          <p className="text-xs text-text-weak">
            {language.t("settings.providers.chatGptUsageError")}
          </p>
        ) : windows.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {windows.map((window) => (
              <UsageWindow key={`${window.windowSeconds}:${window.resetsAt}`} window={window} />
            ))}
          </div>
        ) : null}

        {readyUsage ? (
          <p className="text-[11px] text-text-weaker">
            {language.t("settings.providers.chatGptUsageUpdated", {
              time: formatRelativeTime(readyUsage.fetchedAt),
            })}
          </p>
        ) : null}
      </div>
    </SettingsListCard>
  )
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
  const platform = usePlatform()
  const connected = Boolean(props.provider?.connected)
  const unavailable = !props.provider
  const learnMoreHref = props.learnMoreHref
  const learnMoreLabel = props.learnMoreLabel

  return (
    <div
      data-component="settings-recommended-provider-row"
      className={cn(
        "flex flex-col gap-2 px-3.5 py-3 transition-colors duration-150",
        "hover:bg-surface-raised-base-hover/60",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            connected
              ? "border-border-success-base bg-surface-success-base/10 text-text-success-base"
              : "border-border-weaker-base bg-background-base text-text-base",
          )}
        >
          <ProviderIcon id={props.iconID} className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-text-strong">{props.title}</p>
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
          <p className="mt-0.5 line-clamp-2 text-xs text-text-weak">
            <span>{props.description}</span>
            {learnMoreHref && learnMoreLabel ? (
              <>
                {" "}
                <a
                  href={learnMoreHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-text-interactive-base underline-offset-2 hover:underline"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    platform.openLink(learnMoreHref)
                  }}
                >
                  {learnMoreLabel}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={connected ? "secondary" : "default"}
          className="shrink-0 active:scale-[0.97]"
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
      {props.error ? (
        <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

function ProviderListRow(props: {
  provider: ProviderInfo
  connected: boolean
  last: boolean
  onOpenDialog: (providerID: string) => void
  busy?: boolean
}) {
  const action = resolveProviderListRowAction(props.provider, props.connected)
  const controls = resolveProviderListRowControls(props.provider, props.connected)

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

        <div className="flex shrink-0 items-center gap-2">
          {controls.showEnvNote ? (
            <span className="text-xs text-text-weak">
              {language.t("settings.providers.connectedFromEnv")}
            </span>
          ) : null}

          {controls.showEdit ? (
            <Button
              data-action={`settings-provider-edit-${props.provider.id}`}
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 active:scale-[0.97] transition-all duration-150 ease-out"
              onClick={() => props.onOpenDialog(props.provider.id)}
              disabled={props.busy}
            >
              {language.t("settings.providers.editConnection")}
            </Button>
          ) : null}

          {controls.showConnect || controls.showDisconnect ? (
            <Button
              data-action={
                action === "connect"
                  ? `settings-provider-connect-${props.provider.id}`
                  : `settings-provider-edit-${props.provider.id}`
              }
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 active:scale-[0.97] transition-all duration-150 ease-out"
              onClick={() => props.onOpenDialog(props.provider.id)}
              disabled={props.busy}
            >
              {action === "connect"
                ? language.t("common.connect")
                : language.t("settings.providers.editConnection")}
            </Button>
          ) : null}
        </div>
      </div>
      {props.last ? null : <Separator />}
    </div>
  )
}

export function ProvidersSettings() {
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const openProjects = useChatStore((state) => state.openProjects)
  const providerQuery = useQuery(providerCatalogSnapshotQueryOptions())
  const providerCatalog = providerQuery.data
  const providers = useMemo(
    () => (providerCatalog ? getConnectedProviders(providerCatalog.providers) : []),
    [providerCatalog],
  )
  const allProviders = useMemo(() => providerCatalog?.providers ?? [], [providerCatalog?.providers])
  const recommendedProviders = useMemo(
    () => resolveRecommendedProviderCards(allProviders),
    [allProviders],
  )
  const availableProviders = useMemo(() => resolveAvailableProviders(allProviders), [allProviders])
  const recommendedSearchLabelsByID = useMemo(
    () =>
      new Map(
        RECOMMENDED_PROVIDER_DEFINITIONS.map((definition) => [
          definition.providerID,
          [definition.title, definition.description],
        ]),
      ),
    [],
  )
  const [query, setQuery] = useState("")
  const showSearch = allProviders.length >= PROVIDER_SEARCH_VISIBLE_THRESHOLD
  const searchResults = useMemo(
    () =>
      resolveProviderSearchResults({
        allProviders,
        connectedProviders: providers,
        availableProviders,
        query,
        extraLabelsByID: recommendedSearchLabelsByID,
      }),
    [allProviders, providers, availableProviders, query, recommendedSearchLabelsByID],
  )
  const filteredConnectedProviders = searchResults.connected
  const filteredAvailableProviders = searchResults.available
  const filteredRecommendedProviders = useMemo(() => {
    if (!searchResults.matchedIDs) return recommendedProviders
    return recommendedProviders.filter((provider) => searchResults.matchedIDs?.has(provider.id))
  }, [recommendedProviders, searchResults.matchedIDs])
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerDialogTarget, setProviderDialogTarget] = useState<string | undefined>(undefined)
  const [chatGptConnecting, setChatGptConnecting] = useState(false)
  const [chatGptRefreshing, setChatGptRefreshing] = useState(false)
  const [chatGptWaitingOpen, setChatGptWaitingOpen] = useState(false)
  const [chatGptErrorState, setChatGptError] = useState<string | undefined>(undefined)
  const latestChatGptRequestRef = useRef(0)
  const dismissedChatGptRequestRef = useRef<number | undefined>(undefined)

  const providersByID = useMemo(
    () => new Map(allProviders.map((provider) => [provider.id, provider])),
    [allProviders],
  )
  const chatGptProvider = providersByID.get(OPENAI_PROVIDER_ID)
  const chatGptOAuthConfigured =
    Boolean(chatGptProvider?.connected) &&
    providerCatalog?.openAIModelAvailability.status !== "not_connected"
  const openAIUsageQuery = useQuery(openAIUsageQueryOptions(chatGptOAuthConfigured))
  const showChatGptAccountCard =
    chatGptOAuthConfigured &&
    filteredConnectedProviders.some((provider) => provider.id === OPENAI_PROVIDER_ID)
  const chatGptReconnectRequired =
    Boolean(showChatGptAccountCard && providerCatalog) &&
    isChatGptReconnectRequired({
      modelAvailability: providerCatalog?.openAIModelAvailability ?? { status: "not_connected" },
      usage: openAIUsageQuery.data,
    })
  const genericConnectedProviders = showChatGptAccountCard
    ? filteredConnectedProviders.filter((provider) => provider.id !== OPENAI_PROVIDER_ID)
    : filteredConnectedProviders
  const dialogProvider = providerDialogTarget
    ? providersByID.get(providerDialogTarget)
    : allProviders[0]
  const chatGptErrors = resolveChatGptAuthErrorSurfaces({
    connected: Boolean(chatGptProvider?.connected),
    error: chatGptErrorState,
  })

  const chatGptAccountCard =
    showChatGptAccountCard && chatGptProvider && providerCatalog ? (
      <ChatGptAccountCard
        modelAvailability={providerCatalog.openAIModelAvailability}
        usage={openAIUsageQuery.data}
        error={chatGptErrors.accountError}
        usageLoading={openAIUsageQuery.isPending}
        refreshing={chatGptRefreshing}
        reconnecting={chatGptConnecting}
        reconnectRequired={chatGptReconnectRequired}
        onManage={() => openProviderDialog(OPENAI_PROVIDER_ID)}
        onReconnect={() => void handleConnectChatGpt()}
        onRefresh={() => void handleRefreshChatGpt()}
      />
    ) : null

  function openProviderDialog(initialProvider?: string) {
    setProviderDialogTarget(initialProvider)
    setProviderDialogOpen(true)
  }

  async function handleProvidersUpdated() {
    await invalidateAllProviderCatalogSnapshotQueries(queryClient)
    await resetOpenAIUsageQuery(queryClient)
    await Promise.allSettled(openProjects.map((directory) => loadProviderCatalog(directory)))
  }

  async function handleRefreshChatGpt() {
    setChatGptRefreshing(true)
    try {
      await Promise.allSettled([refreshOpenAIUsage(queryClient), refreshOpenAIModelAvailability()])
      await invalidateAllProviderCatalogSnapshotQueries(queryClient)
    } finally {
      setChatGptRefreshing(false)
    }
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
        loadProviderCatalogSnapshot: () => loadProviderCatalogSnapshot(),
        authorizeProviderOAuth: ({ providerID, methodIndex }) =>
          authorizeProviderOAuth({ providerID, methodIndex }),
        completeProviderOAuth: ({ providerID, methodIndex }) =>
          completeProviderOAuth({ providerID, methodIndex }),
        reloadProviderRuntime,
        forceReconnect: chatGptReconnectRequired,
        onAuthenticated: () => {
          if (latestChatGptRequestRef.current === requestID) {
            setChatGptWaitingOpen(false)
          }
        },
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
        {showSearch ? (
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={language.t("settings.providers.searchPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
        ) : null}

        {chatGptReconnectRequired && chatGptAccountCard ? (
          <ProviderSection title={language.t("settings.providers.needsAttentionSection")}>
            {chatGptAccountCard}
          </ProviderSection>
        ) : null}

        {(!chatGptReconnectRequired && chatGptAccountCard) ||
        genericConnectedProviders.length > 0 ? (
          <ProviderSection title={language.t("settings.providers.connectedSection")}>
            <div className="flex flex-col gap-3">
              {chatGptReconnectRequired ? null : chatGptAccountCard}
              {genericConnectedProviders.length > 0 ? (
                <SettingsListCard>
                  {genericConnectedProviders.map((provider, index) => (
                    <ProviderListRow
                      key={provider.id}
                      provider={provider}
                      connected
                      last={index === genericConnectedProviders.length - 1}
                      onOpenDialog={openProviderDialog}
                    />
                  ))}
                </SettingsListCard>
              ) : null}
            </div>
          </ProviderSection>
        ) : null}

        {filteredRecommendedProviders.length > 0 ? (
          <ProviderSection title={language.t("settings.providers.recommendedSection")}>
            <SettingsListCard>
              {filteredRecommendedProviders.map((provider, index) => {
                const definition = RECOMMENDED_PROVIDER_DEFINITIONS.find(
                  (item) => item.providerID === provider.id,
                )
                if (!definition) return null

                return (
                  <div
                    key={definition.providerID}
                    className={index > 0 ? "border-t border-border-weaker-base" : undefined}
                  >
                    <RecommendedProviderCard
                      provider={provider}
                      title={definition.title}
                      description={definition.description}
                      iconID={definition.iconID}
                      connectLabel={definition.connectLabel}
                      learnMoreHref={definition.learnMoreHref}
                      learnMoreLabel={definition.learnMoreLabel}
                      unavailableLabel={language.t("settings.providers.unavailable")}
                      busy={
                        definition.providerID === OPENAI_PROVIDER_ID ? chatGptConnecting : undefined
                      }
                      error={
                        definition.providerID === OPENAI_PROVIDER_ID
                          ? chatGptErrors.availableError
                          : undefined
                      }
                      onConnect={() => {
                        if (definition.providerID === OPENAI_PROVIDER_ID) {
                          void handleConnectChatGpt()
                          return
                        }
                        openProviderDialog(definition.providerID)
                      }}
                      onManage={() => openProviderDialog(definition.providerID)}
                    />
                  </div>
                )
              })}
            </SettingsListCard>
          </ProviderSection>
        ) : null}

        <ProviderSection title={language.t("settings.providers.allProvidersSection")}>
          {chatGptErrors.availableError ? (
            <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
              {chatGptErrors.availableError}
            </p>
          ) : null}
          <SettingsListCard>
            {filteredAvailableProviders.length > 0 ? (
              filteredAvailableProviders.map((provider, index) => (
                <ProviderListRow
                  key={provider.id}
                  provider={provider}
                  connected={false}
                  last={index === filteredAvailableProviders.length - 1}
                  onOpenDialog={(providerID) => {
                    if (providerID === OPENAI_PROVIDER_ID) {
                      void handleConnectChatGpt()
                      return
                    }
                    openProviderDialog(providerID)
                  }}
                  busy={provider.id === OPENAI_PROVIDER_ID ? chatGptConnecting : undefined}
                />
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-text-weak">
                {query.trim()
                  ? language.t("settings.providers.noResults")
                  : language.t("settings.providers.allConnected")}
              </div>
            )}
          </SettingsListCard>
        </ProviderSection>
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

      {dialogProvider ? (
        <ConnectProviderDialog
          open={providerDialogOpen}
          provider={dialogProvider}
          onOpenChange={setProviderDialogOpen}
          onUpdated={handleProvidersUpdated}
        />
      ) : null}
    </>
  )
}
