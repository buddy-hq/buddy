import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@buddy/ui"
import { InfoIcon } from "lucide-react"
import {
  formatMcpError,
  getMcpStatusLabel,
  parseMcpConfigMap,
} from "@/components/mcp-dialog/mcp-config-schema"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { authenticateMcpServer, connectMcpServer, patchProjectConfig } from "@/state/chat-actions"
import { globalConfigQueryOptions } from "@/state/global-config-query"
import {
  buildNotebookLearnerMemoryPatch,
  resolveNotebookLearnerMemorySelection,
} from "@/state/learner-memory-settings"
import { mcpStatusQueryOptions } from "@/state/mcp-directory-query"
import { buildNotebookMcpOverridePatch, resolveNotebookMcpEnabled } from "@/state/mcp-settings"
import {
  invalidateNotebookRawProjectConfigQuery,
  notebookRawProjectConfigQueryOptions,
} from "@/state/notebook-settings-query"
import {
  STANDARDS_TOOL_DESCRIPTIONS,
  STANDARDS_TOOL_DISPLAY_NAMES,
  STANDARDS_TOOL_IDS,
  buildNotebookStandardsOverridePatch,
  notebookStandardUsesGlobalDefault,
  resolveNotebookStandardEnabled,
} from "@/state/standards-settings"
import {
  SettingsListCard,
  SettingsRow,
  SettingsSectionHeader,
  SettingsSwitchControl,
} from "../../settings/settings-primitives"
import { useStandardsRuntime } from "../../settings/use-standards-runtime"
import type { ArchiveState, RenameState } from "./types"

const EMPTY_CONFIG: Record<string, unknown> = {}

type NotebookCreationDialogProps = {
  open: boolean
  busy: boolean
  notebookName: string
  title: string
  description: string
  confirmLabel: string
  placeholder: string
  onOpenChange: (open: boolean) => void
  onNotebookNameChange: (name: string) => void
  onCreate: () => void
  onOpenExistingFolder?: () => void
  enableLearnerMemory?: boolean
  onLearnerMemoryChange?: (enabled: boolean) => void
  enableAutoExtract?: boolean
  onAutoExtractChange?: (enabled: boolean) => void
}

type NotebookSettingsDialogProps = {
  open: boolean
  directory: string
  notebookName: string
  onOpenChange: (open: boolean) => void
}

type ChatLeftSidebarDialogsProps = {
  archiveState?: ArchiveState
  archiveSaving: boolean
  renameState?: RenameState
  renameSaving: boolean
  onArchiveCancel: () => void
  onArchiveConfirm: () => void
  onRenameCancel: () => void
  onRenameConfirm: () => void
  onRenameTitleChange: (title: string) => void
}

export function ChatLeftSidebarDialogs(props: ChatLeftSidebarDialogsProps) {
  return (
    <>
      <Dialog
        open={props.archiveState !== undefined}
        onOpenChange={(open) => {
          if (!open && !props.archiveSaving) {
            props.onArchiveCancel()
          }
        }}
      >
        <DialogContent data-component="left-sidebar-archive-dialog">
          <DialogHeader>
            <DialogTitle>{language.t("sidebar.archiveThreadTitle")}</DialogTitle>
            <DialogDescription>
              {props.archiveState
                ? language.t("sidebar.archiveThreadQuestion", { title: props.archiveState.title })
                : language.t("sidebar.archiveThreadFallback")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              data-action="left-sidebar-archive-cancel"
              variant="outline"
              onClick={props.onArchiveCancel}
              disabled={props.archiveSaving}
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              data-action="left-sidebar-archive-confirm"
              variant="destructive"
              onClick={props.onArchiveConfirm}
              disabled={props.archiveSaving}
            >
              {props.archiveSaving
                ? language.t("sidebar.archiving")
                : language.t("sidebar.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={props.renameState !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            props.onRenameCancel()
          }
        }}
      >
        <DialogContent data-component="left-sidebar-rename-dialog">
          <DialogHeader>
            <DialogTitle>{language.t("sidebar.renameThread")}</DialogTitle>
            <DialogDescription>{language.t("sidebar.renameThreadHint")}</DialogDescription>
          </DialogHeader>
          <Input
            data-action="left-sidebar-rename-input"
            autoFocus
            value={props.renameState?.title ?? ""}
            onChange={(event) => props.onRenameTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                props.onRenameConfirm()
              }
            }}
          />
          <DialogFooter>
            <Button
              data-action="left-sidebar-rename-cancel"
              variant="outline"
              onClick={props.onRenameCancel}
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              data-action="left-sidebar-rename-save"
              disabled={props.renameSaving || !props.renameState?.title.trim()}
              onClick={props.onRenameConfirm}
            >
              {props.renameSaving ? language.t("common.saving") : language.t("sidebar.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function NotebookSettingsDialog(props: NotebookSettingsDialogProps) {
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | undefined>(undefined)
  const globalConfigQuery = useQuery({
    ...globalConfigQueryOptions(),
    enabled: props.open,
  })
  const rawProjectConfigQuery = useQuery({
    ...notebookRawProjectConfigQueryOptions(props.directory),
    enabled: props.open && props.directory.length > 0,
  })
  const mcpStatusQuery = useQuery({
    ...mcpStatusQueryOptions(props.directory),
    enabled: props.open && props.directory.length > 0,
  })
  const { standardsEnabled, standardsLoading } = useStandardsRuntime({
    open: props.open,
    platform: platform.platform,
  })
  const globalConfig = globalConfigQuery.data ?? EMPTY_CONFIG
  const rawProjectConfig = rawProjectConfigQuery.data ?? EMPTY_CONFIG
  const learnerMemorySelection = resolveNotebookLearnerMemorySelection(
    globalConfig,
    rawProjectConfig,
  )
  const notebookControlsDisabled =
    globalConfigQuery.isPending ||
    rawProjectConfigQuery.isPending ||
    !learnerMemorySelection.masterEnabled
  const autoExtractDisabled =
    globalConfigQuery.isPending ||
    rawProjectConfigQuery.isPending ||
    !learnerMemorySelection.masterEnabled ||
    !learnerMemorySelection.enabled
  const globalMcpConfigByName = useMemo(() => parseMcpConfigMap(globalConfig), [globalConfig])
  const globalMcpNames = useMemo(
    () => Object.keys(globalMcpConfigByName).sort((left, right) => left.localeCompare(right)),
    [globalMcpConfigByName],
  )
  const mcpStatusByName = mcpStatusQuery.data ?? {}
  const notebookMcpQueryError =
    globalConfigQuery.error ?? rawProjectConfigQuery.error ?? mcpStatusQuery.error

  async function persistNotebookSettings(
    nextKey: string,
    patch: Record<string, unknown> | undefined,
    invalidateMcpStatus = false,
  ) {
    if (!patch) {
      return
    }

    setPendingKey(nextKey)
    setSettingsError(undefined)

    try {
      await patchProjectConfig(props.directory, patch)
      await Promise.all([
        invalidateNotebookRawProjectConfigQuery(queryClient, props.directory),
        invalidateMcpStatus
          ? queryClient.invalidateQueries({
              queryKey: mcpStatusQueryOptions(props.directory).queryKey,
            })
          : Promise.resolve(),
      ])
    } catch (error) {
      setSettingsError(formatMcpError(error))
    } finally {
      setPendingKey(null)
    }
  }

  async function onToggleNotebookLearnerMemory(enabled: boolean) {
    await persistNotebookSettings(
      "learner-memory",
      buildNotebookLearnerMemoryPatch({
        globalConfig,
        rawProjectConfig,
        enabled,
        autoExtract: enabled ? learnerMemorySelection.autoExtractWhenEnabled : false,
      }),
    )
  }

  async function onToggleNotebookLearnerMemoryAutoExtract(autoExtract: boolean) {
    await persistNotebookSettings(
      "learner-memory-auto-extract",
      buildNotebookLearnerMemoryPatch({
        globalConfig,
        rawProjectConfig,
        enabled: learnerMemorySelection.enabled,
        autoExtract,
      }),
    )
  }

  async function onToggleNotebookStandardsTool(
    toolId: (typeof STANDARDS_TOOL_IDS)[number],
    enabled: boolean,
  ) {
    await persistNotebookSettings(
      `standards:${toolId}`,
      buildNotebookStandardsOverridePatch({
        globalConfig,
        rawProjectConfig,
        toolId,
        enabled,
      }),
    )
  }

  async function onToggleNotebookMcp(name: string, enabled: boolean) {
    await persistNotebookSettings(
      `mcp:${name}`,
      buildNotebookMcpOverridePatch({
        globalConfigByName: globalMcpConfigByName,
        rawProjectConfig,
        name,
        enabled,
      }),
      true,
    )
  }

  async function onRepairNotebookMcp(name: string) {
    const status = mcpStatusByName[name]
    setPendingKey(`mcp:${name}`)
    setSettingsError(undefined)

    try {
      if (status?.status === "needs_auth" || status?.status === "needs_client_registration") {
        await authenticateMcpServer(props.directory, name)
      } else {
        await connectMcpServer(props.directory, name)
      }

      await queryClient.invalidateQueries({
        queryKey: mcpStatusQueryOptions(props.directory).queryKey,
      })
    } catch (error) {
      setSettingsError(formatMcpError(error))
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{language.t("sidebar.notebookSettingsTitle")}</DialogTitle>
          <DialogDescription>
            {language.t("sidebar.notebookSettingsDescription", {
              notebook: props.notebookName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
            {props.directory}
          </div>

          <div className="space-y-2">
            <SettingsSectionHeader
              title={language.t("sidebar.notebookSettingsLearnerMemorySectionTitle")}
              description={language.t("sidebar.notebookSettingsLearnerMemorySectionDescription")}
              badge={language.t("sidebar.notebookSettingsBadge")}
            />
            {!learnerMemorySelection.masterEnabled ? (
              <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
                {language.t("sidebar.notebookSettingsLearnerMemoryGlobalDisabled")}
              </div>
            ) : null}
            <SettingsListCard>
              <SettingsRow
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{language.t("settings.notebook.learnerMemoryTitle")}</span>
                    <Badge variant="outline" className="h-5">
                      {learnerMemorySelection.enabledUsesGlobalDefault
                        ? language.t("settings.notebook.inherited")
                        : language.t("settings.notebook.overridden")}
                    </Badge>
                  </div>
                }
                description={language.t("settings.notebook.learnerMemoryDescription")}
                control={
                  <SettingsSwitchControl
                    dataAction="notebook-settings-learner-memory"
                    checked={learnerMemorySelection.enabled}
                    onCheckedChange={(checked) => {
                      void onToggleNotebookLearnerMemory(checked)
                    }}
                    disabled={notebookControlsDisabled || pendingKey === "learner-memory"}
                    ariaLabel={language.t("settings.notebook.learnerMemoryAria")}
                    onLabel={language.t("settings.notebook.on")}
                    offLabel={language.t("settings.notebook.off")}
                  />
                }
              />
              <SettingsRow
                title={
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{language.t("settings.notebook.learnerMemoryAutoExtractTitle")}</span>
                    <Badge variant="outline" className="h-5">
                      {learnerMemorySelection.autoExtractUsesGlobalDefault
                        ? language.t("settings.notebook.inherited")
                        : language.t("settings.notebook.overridden")}
                    </Badge>
                  </div>
                }
                description={language.t("settings.notebook.learnerMemoryAutoExtractDescription")}
                last
                control={
                  <SettingsSwitchControl
                    dataAction="notebook-settings-learner-memory-auto"
                    checked={learnerMemorySelection.autoExtract}
                    onCheckedChange={(checked) => {
                      void onToggleNotebookLearnerMemoryAutoExtract(checked)
                    }}
                    disabled={autoExtractDisabled || pendingKey === "learner-memory-auto-extract"}
                    ariaLabel={language.t("settings.notebook.learnerMemoryAutoExtractAria")}
                    onLabel={language.t("settings.notebook.on")}
                    offLabel={language.t("settings.notebook.off")}
                  />
                }
              />
            </SettingsListCard>
          </div>

          {standardsLoading || standardsEnabled ? (
            <div className="space-y-2">
              <SettingsSectionHeader
                title={language.t("sidebar.notebookSettingsStandardsSectionTitle")}
                description={language.t("sidebar.notebookSettingsStandardsSectionDescription")}
                badge={language.t("sidebar.notebookSettingsBadge")}
              />
              {standardsLoading ? (
                <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
                  {language.t("mcp.listPanel.loading")}
                </div>
              ) : (
                <SettingsListCard>
                  {STANDARDS_TOOL_IDS.map((toolId, index) => (
                    <SettingsRow
                      key={toolId}
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{STANDARDS_TOOL_DISPLAY_NAMES[toolId]}</span>
                          <Badge variant="outline" className="h-5">
                            {notebookStandardUsesGlobalDefault(rawProjectConfig, toolId)
                              ? language.t("settings.notebook.inherited")
                              : language.t("settings.notebook.overridden")}
                          </Badge>
                        </div>
                      }
                      description={STANDARDS_TOOL_DESCRIPTIONS[toolId]}
                      last={index === STANDARDS_TOOL_IDS.length - 1}
                      control={
                        <SettingsSwitchControl
                          dataAction={`notebook-settings-standards-${toolId}`}
                          checked={resolveNotebookStandardEnabled(
                            globalConfig,
                            rawProjectConfig,
                            toolId,
                          )}
                          disabled={pendingKey === `standards:${toolId}`}
                          ariaLabel={language.t("settings.tools.toggleAria", {
                            tool: STANDARDS_TOOL_DISPLAY_NAMES[toolId],
                          })}
                          onLabel={language.t("settings.notebook.on")}
                          offLabel={language.t("settings.notebook.off")}
                          onCheckedChange={(checked) => {
                            void onToggleNotebookStandardsTool(toolId, checked)
                          }}
                        />
                      }
                    />
                  ))}
                </SettingsListCard>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <SettingsSectionHeader
              title={language.t("sidebar.notebookSettingsMcpSectionTitle")}
              description={language.t("sidebar.notebookSettingsMcpSectionDescription")}
              badge={language.t("sidebar.notebookSettingsBadge")}
            />
            {globalConfigQuery.isPending || rawProjectConfigQuery.isPending ? (
              <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
                {language.t("mcp.listPanel.loading")}
              </div>
            ) : globalMcpNames.length === 0 ? (
              <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
                {language.t("sidebar.notebookSettingsMcpEmpty")}
              </div>
            ) : (
              <SettingsListCard>
                {globalMcpNames.map((name, index) => {
                  const config = globalMcpConfigByName[name]
                  const enabled = resolveNotebookMcpEnabled(
                    globalMcpConfigByName,
                    rawProjectConfig,
                    name,
                  )
                  const status = enabled ? mcpStatusByName[name] : undefined
                  const pending = pendingKey === `mcp:${name}`
                  const statusLabel = !enabled
                    ? language.t("mcp.statusLabels.disabled")
                    : status
                      ? getMcpStatusLabel(status.status)
                      : language.t("mcp.listPanel.configured")
                  const showRepairAction =
                    enabled && status?.status !== "connected" && status?.status !== "disabled"

                  return (
                    <SettingsRow
                      key={name}
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{name}</span>
                          <Badge variant="outline" className="h-5">
                            {statusLabel}
                          </Badge>
                          <Badge variant="secondary" className="h-5">
                            {config.type}
                          </Badge>
                        </div>
                      }
                      description={
                        status?.error
                          ? formatMcpError(status.error)
                          : config.type === "remote"
                            ? config.url
                            : config.command.join(" ")
                      }
                      last={index === globalMcpNames.length - 1}
                      control={
                        <div className="flex min-w-0 items-center gap-2">
                          {showRepairAction ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={pending}
                              onClick={() => {
                                void onRepairNotebookMcp(name)
                              }}
                            >
                              {language.t("mcp.listPanel.connect")}
                            </Button>
                          ) : null}
                          <SettingsSwitchControl
                            dataAction={`notebook-settings-mcp-${name}`}
                            checked={enabled}
                            disabled={pending}
                            ariaLabel={language.t("mcp.listPanel.switchAria.enable", { name })}
                            onLabel={language.t("settings.notebook.on")}
                            offLabel={language.t("settings.notebook.off")}
                            onCheckedChange={(checked) => {
                              void onToggleNotebookMcp(name, checked)
                            }}
                          />
                        </div>
                      }
                    />
                  )
                })}
              </SettingsListCard>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-text-weak">
            <span>{language.t("sidebar.notebookSettingsAutosaveHint")}</span>
            {pendingKey ? <span>{language.t("common.saving")}</span> : null}
          </div>

          {notebookMcpQueryError ? (
            <p className="text-sm text-icon-critical-base">
              {formatMcpError(notebookMcpQueryError)}
            </p>
          ) : null}
          {settingsError ? (
            <p className="text-sm text-icon-critical-base">{settingsError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {language.t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NotebookCreationDialog(props: NotebookCreationDialogProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !props.busy) {
          props.onOpenChange(false)
        }
      }}
    >
      <DialogContent data-component="left-sidebar-create-notebook-dialog">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-action="left-sidebar-create-notebook-input"
            autoFocus
            value={props.notebookName}
            onChange={(event) => props.onNotebookNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                props.onCreate()
              }
            }}
            placeholder={props.placeholder}
          />
          {props.enableLearnerMemory !== undefined && (
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-sm text-text-base">
                {language.t("sidebar.notebookLearnerMemory")}
              </span>
              <Switch
                checked={props.enableLearnerMemory}
                onCheckedChange={props.onLearnerMemoryChange}
                disabled={props.busy}
              />
            </div>
          )}
          {props.enableAutoExtract !== undefined && (
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-sm text-text-base">
                {language.t("sidebar.notebookLearnerMemoryAutoExtract")}
              </span>
              <Switch
                checked={props.enableAutoExtract}
                onCheckedChange={props.onAutoExtractChange}
                disabled={props.busy || !props.enableLearnerMemory}
              />
            </div>
          )}
          {props.onOpenExistingFolder && (
            <div className="flex justify-center pt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={props.onOpenExistingFolder}
                    className="group inline-flex items-center gap-1.5 text-xs text-text-weak transition-colors hover:text-text-base"
                  >
                    <span className="underline decoration-border-base underline-offset-4 group-hover:decoration-text-weak">
                      {language.t("sidebar.openExistingFolder")}
                    </span>
                    <InfoIcon className="size-3 text-text-weaker transition-colors group-hover:text-text-weak" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
                  {language.t("sidebar.openExistingFolderTooltip")}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            data-action="left-sidebar-create-notebook-cancel"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.busy}
          >
            {language.t("common.cancel")}
          </Button>
          <Button
            data-action="left-sidebar-create-notebook-confirm"
            onClick={props.onCreate}
            disabled={props.busy || !props.notebookName.trim()}
          >
            {props.busy ? language.t("common.saving") : props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
