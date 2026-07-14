import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  cn,
  Field,
  FieldLabel,
  FolderOpenIcon,
  FolderPlusIcon,
  PencilIcon,
  ArchiveIcon,
  Spinner,
  BookIcon,
} from "@buddy/ui"
import {
  formatMcpError,
  getMcpStatusLabel,
  mcpNeedsAuth,
  mcpNeedsClientRegistration,
  parseMcpConfigMap,
  type McpConfig,
} from "@/components/mcp-dialog/mcp-config-schema"
import { McpEditorDialog } from "@/components/mcp-dialog/mcp-editor-dialog"
import { useMcpEditor } from "@/components/mcp-dialog/use-mcp-editor"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  authenticateMcpServer,
  connectMcpServer,
  patchProjectConfig,
  saveProjectMcpConfig,
} from "@/state/chat-actions"
import type { McpStatusInfo, McpStatusMap } from "@/state/chat-types"
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
  STANDARDS_TOOL_DISPLAY_NAMES,
  STANDARDS_TOOL_IDS,
  buildNotebookStandardsOverridePatch,
  resolveNotebookStandardEnabled,
} from "@/state/standards-settings"
import { SettingsListCard, SettingsSectionHeader } from "../../settings/settings-primitives"
import { useStandardsRuntime } from "../../settings/use-standards-runtime"
import type { ArchiveState, RenameState } from "./types"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
  experimentalFeaturesQueryOptions,
} from "@/state/experimental-features-query"

const EMPTY_CONFIG: Record<string, unknown> = {}
const EMPTY_MCP_STATUS: McpStatusMap = {}

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
  onOpenMcpSettings: () => void
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

function getMcpRepairButtonLabel(input: { pending: boolean; status: McpStatusInfo | undefined }) {
  if (mcpNeedsClientRegistration(input.status)) {
    return language.t("mcp.listPanel.editDetails")
  }

  if (input.pending) {
    return mcpNeedsAuth(input.status)
      ? language.t("mcp.listPanel.signingIn")
      : language.t("mcp.listPanel.connecting")
  }

  return mcpNeedsAuth(input.status)
    ? language.t("mcp.listPanel.signIn")
    : language.t("mcp.listPanel.connect")
}

function getMcpConfigDescription(config: McpConfig | undefined, status: McpStatusInfo | undefined) {
  if (status?.error) {
    return formatMcpError(status.error)
  }

  if (!config) {
    return language.t("mcp.listPanel.configured")
  }

  return config.type === "remote" ? config.url : config.command.join(" ")
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
        <DialogContent data-component="left-sidebar-archive-dialog" className="sm:max-w-md">
          <DialogHeader className="flex flex-col items-center text-center space-y-3">
            <div className="flex size-12 items-center justify-center rounded-full border border-border-weak bg-surface-weak/50 text-icon-weak-base shadow-xs">
              <ArchiveIcon className="size-5.5" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-lg font-semibold">
                {language.t("sidebar.archiveThreadTitle")}
              </DialogTitle>
              <DialogDescription className="text-sm text-text-weak max-w-xs mx-auto leading-normal">
                {props.archiveState
                  ? language.t("sidebar.archiveThreadQuestion", { title: props.archiveState.title })
                  : language.t("sidebar.archiveThreadFallback")}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-2 mt-4">
            <Button
              data-action="left-sidebar-archive-cancel"
              variant="outline"
              onClick={props.onArchiveCancel}
              disabled={props.archiveSaving}
              className="w-full sm:w-auto min-w-28 active:scale-[0.97] transition-transform"
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              data-action="left-sidebar-archive-confirm"
              onClick={props.onArchiveConfirm}
              disabled={props.archiveSaving}
              className="w-full sm:w-auto min-w-28 active:scale-[0.97] transition-transform"
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
        <DialogContent data-component="left-sidebar-rename-dialog" className="sm:max-w-md">
          <DialogHeader className="flex flex-col items-center text-center space-y-3">
            <div className="flex size-12 items-center justify-center rounded-full border border-border-weak bg-surface-weak/50 text-icon-weak-base shadow-xs">
              <PencilIcon className="size-5.5" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-lg font-semibold">
                {language.t("sidebar.renameThread")}
              </DialogTitle>
              <DialogDescription className="text-sm text-text-weak max-w-xs mx-auto leading-normal">
                {language.t("sidebar.renameThreadHint")}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="py-2">
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
              className="h-10 text-sm px-3 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
            />
          </div>
          <DialogFooter className="sm:justify-end gap-2 mt-2">
            <Button
              data-action="left-sidebar-rename-cancel"
              variant="outline"
              onClick={props.onRenameCancel}
              className="active:scale-[0.97] transition-transform"
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              data-action="left-sidebar-rename-save"
              disabled={props.renameSaving || !props.renameState?.title.trim()}
              onClick={props.onRenameConfirm}
              className="active:scale-[0.97] transition-transform"
            >
              {props.renameSaving ? language.t("common.saving") : language.t("sidebar.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type SettingsItemRowProps = {
  title: string
  description?: React.ReactNode
  control: React.ReactNode
  badge?: React.ReactNode
  disabled?: boolean
}

function SettingsItemRow({ title, description, control, badge, disabled }: SettingsItemRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5 border-t border-border-base/40 first:border-t-0 hover:bg-surface-weak/5 transition-[background-color,opacity]",
        disabled && "opacity-45 pointer-events-none",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-text-strong tracking-[-0.01em]">
            {title}
          </span>
          {badge}
        </div>
        {description && <div className="text-xs text-text-weak leading-normal">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">{control}</div>
    </div>
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
  const experimentalFeaturesQuery = useQuery({
    ...experimentalFeaturesQueryOptions(),
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
  const notebookMcpEditor = useMcpEditor({
    onSave: async ({ name, config }) => {
      await saveProjectMcpConfig(props.directory, name, config)
      await Promise.all([
        invalidateNotebookRawProjectConfigQuery(queryClient, props.directory),
        queryClient.invalidateQueries({
          queryKey: mcpStatusQueryOptions(props.directory).queryKey,
        }),
      ])
    },
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
  const learnerMemoryExperimentEnabled = experimentalFeatureIsEnabled(
    experimentalFeaturesQuery.data,
    EXPERIMENTAL_FEATURE_ID.learnerMemory,
  )
  const notebookControlsDisabled = globalConfigQuery.isPending || rawProjectConfigQuery.isPending
  const autoExtractDisabled =
    globalConfigQuery.isPending ||
    rawProjectConfigQuery.isPending ||
    !learnerMemorySelection.enabled
  const globalMcpConfigByName = useMemo(() => parseMcpConfigMap(globalConfig), [globalConfig])
  const notebookMcpConfigByName = useMemo(
    () => parseMcpConfigMap(rawProjectConfig),
    [rawProjectConfig],
  )
  const mcpStatusByName = mcpStatusQuery.data ?? EMPTY_MCP_STATUS
  const mcpNames = useMemo(
    () =>
      Array.from(
        new Set([
          ...Object.keys(globalMcpConfigByName),
          ...Object.keys(notebookMcpConfigByName),
          ...Object.keys(mcpStatusByName),
        ]),
      ).sort((left, right) => left.localeCompare(right)),
    [globalMcpConfigByName, notebookMcpConfigByName, mcpStatusByName],
  )
  const notebookMcpQueryError =
    globalConfigQuery.error ?? rawProjectConfigQuery.error ?? mcpStatusQuery.error

  function openNotebookMcpEditor(name: string) {
    const config = notebookMcpConfigByName[name]
    if (!config) {
      props.onOpenMcpSettings()
      return
    }

    setSettingsError(undefined)
    notebookMcpEditor.openEditEditor(name, config)
  }

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
    if (mcpNeedsClientRegistration(status)) {
      openNotebookMcpEditor(name)
      return
    }

    setPendingKey(`mcp:${name}`)
    setSettingsError(undefined)

    try {
      if (mcpNeedsAuth(status)) {
        await authenticateMcpServer(props.directory, name)
      } else {
        const nextStatusByName = await connectMcpServer(props.directory, name)
        if (mcpNeedsAuth(nextStatusByName[name])) {
          await authenticateMcpServer(props.directory, name)
        }
        if (mcpNeedsClientRegistration(nextStatusByName[name])) {
          openNotebookMcpEditor(name)
          return
        }
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
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="flex flex-col items-start space-y-3.5">
            <div className="flex items-center gap-3 w-full">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border-weak bg-surface-weak/50 text-icon-brand-base shrink-0">
                <BookIcon className="size-5" />
              </div>
              <div className="min-w-0 text-left w-full">
                <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                  <span className="truncate max-w-[320px]" title={props.notebookName}>
                    {props.notebookName}
                  </span>
                  {pendingKey && (
                    <Spinner className="size-3.5 text-text-interactive-base shrink-0" />
                  )}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-[50vh] overflow-y-auto pr-1 -mr-2 space-y-5">
              {learnerMemoryExperimentEnabled ? (
                <div className="space-y-3">
                  <SettingsSectionHeader
                    title={language.t("sidebar.notebookSettingsLearnerMemorySectionTitle")}
                  />
                  <SettingsListCard>
                    <SettingsItemRow
                      title={language.t("settings.notebook.learnerMemoryTitle")}
                      disabled={notebookControlsDisabled || pendingKey === "learner-memory"}
                      control={
                        <Switch
                          data-action="notebook-settings-learner-memory"
                          checked={learnerMemorySelection.enabled}
                          onCheckedChange={(checked) => {
                            void onToggleNotebookLearnerMemory(checked)
                          }}
                          disabled={notebookControlsDisabled || pendingKey === "learner-memory"}
                          aria-label={language.t("settings.notebook.learnerMemoryAria")}
                        />
                      }
                    />
                    <SettingsItemRow
                      title={language.t("settings.notebook.learnerMemoryAutoExtractTitle")}
                      disabled={autoExtractDisabled || pendingKey === "learner-memory-auto-extract"}
                      control={
                        <Switch
                          data-action="notebook-settings-learner-memory-auto"
                          checked={learnerMemorySelection.autoExtract}
                          onCheckedChange={(checked) => {
                            void onToggleNotebookLearnerMemoryAutoExtract(checked)
                          }}
                          disabled={
                            autoExtractDisabled || pendingKey === "learner-memory-auto-extract"
                          }
                          aria-label={language.t("settings.notebook.learnerMemoryAutoExtractAria")}
                        />
                      }
                    />
                  </SettingsListCard>
                </div>
              ) : null}

              {standardsLoading || standardsEnabled ? (
                <>
                  <div className="h-[1px] bg-border-base/40 w-full" />
                  <div className="space-y-3">
                    <SettingsSectionHeader
                      title={language.t("sidebar.notebookSettingsStandardsSectionTitle")}
                    />
                    {standardsLoading ? (
                      <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
                        {language.t("mcp.listPanel.loading")}
                      </div>
                    ) : (
                      <SettingsListCard>
                        {STANDARDS_TOOL_IDS.map((toolId) => (
                          <SettingsItemRow
                            key={toolId}
                            title={STANDARDS_TOOL_DISPLAY_NAMES[toolId]}
                            disabled={pendingKey === `standards:${toolId}`}
                            control={
                              <Switch
                                data-action={`notebook-settings-standards-${toolId}`}
                                checked={resolveNotebookStandardEnabled(
                                  globalConfig,
                                  rawProjectConfig,
                                  toolId,
                                )}
                                disabled={pendingKey === `standards:${toolId}`}
                                aria-label={language.t("settings.tools.toggleAria", {
                                  tool: STANDARDS_TOOL_DISPLAY_NAMES[toolId],
                                })}
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
                </>
              ) : null}

              <>
                <div className="h-[1px] bg-border-base/40 w-full" />
                <div className="space-y-3">
                  <SettingsSectionHeader
                    title={language.t("sidebar.notebookSettingsMcpSectionTitle")}
                  />
                  {globalConfigQuery.isPending || rawProjectConfigQuery.isPending ? (
                    <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
                      {language.t("mcp.listPanel.loading")}
                    </div>
                  ) : mcpNames.length === 0 ? (
                    <div className="rounded-md border border-border-base/60 bg-surface-weak/30 px-3 py-2 text-xs text-text-weak">
                      {language.t("sidebar.notebookSettingsMcpEmpty")}
                    </div>
                  ) : (
                    <SettingsListCard>
                      {mcpNames.map((name) => {
                        const config = notebookMcpConfigByName[name] ?? globalMcpConfigByName[name]
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

                        const statusColorClass = !enabled
                          ? "text-text-weakest font-normal"
                          : status?.status === "connected"
                            ? "text-text-success-base font-medium"
                            : status?.status === "failed"
                              ? "text-text-critical-base font-medium"
                              : mcpNeedsClientRegistration(status)
                                ? "text-text-critical-base font-medium"
                                : mcpNeedsAuth(status)
                                  ? "text-text-warning-base font-medium"
                                  : "text-text-info-strong font-medium"

                        const mcpDescription = (
                          <span className="flex items-center gap-1.5 flex-wrap text-text-weak">
                            <span
                              className="truncate max-w-[260px]"
                              title={getMcpConfigDescription(config, status)}
                            >
                              {getMcpConfigDescription(config, status)}
                            </span>
                            <span className="text-text-weakest select-none font-normal shrink-0">
                              •
                            </span>
                            <span className={cn("shrink-0", statusColorClass)}>{statusLabel}</span>
                          </span>
                        )

                        return (
                          <SettingsItemRow
                            key={name}
                            title={name}
                            description={mcpDescription}
                            control={
                              <div className="flex items-center gap-2">
                                {showRepairAction ? (
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => {
                                      void onRepairNotebookMcp(name)
                                    }}
                                    className="h-7 text-xs px-2.5 active:scale-[0.97] transition-transform"
                                  >
                                    {getMcpRepairButtonLabel({ pending, status })}
                                  </Button>
                                ) : null}
                                <Switch
                                  data-action={`notebook-settings-mcp-${name}`}
                                  checked={enabled}
                                  disabled={pending}
                                  aria-label={language.t(
                                    enabled
                                      ? "mcp.listPanel.switchAria.disable"
                                      : "mcp.listPanel.switchAria.enable",
                                    { name },
                                  )}
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
              </>
            </div>

            {notebookMcpQueryError ? (
              <p className="text-sm text-text-critical-base bg-surface-critical-weak/10 border border-border-critical-weak/30 rounded-lg p-2.5">
                {formatMcpError(notebookMcpQueryError)}
              </p>
            ) : null}
            {settingsError ? (
              <p className="text-sm text-text-critical-base bg-surface-critical-weak/10 border border-border-critical-weak/30 rounded-lg p-2.5">
                {settingsError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onOpenChange(false)}
              className="active:scale-[0.97] transition-transform"
            >
              {language.t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <McpEditorDialog
        open={notebookMcpEditor.editorOpen}
        onOpenChange={notebookMcpEditor.onEditorOpenChange}
        mode={notebookMcpEditor.editorMode}
        description={language.t("sidebar.notebookSettingsMcpEditorDescription")}
        draft={notebookMcpEditor.draft}
        setDraft={notebookMcpEditor.setDraft}
        showOAuthClientFields={notebookMcpEditor.showOAuthClientFields}
        setShowOAuthClientFields={notebookMcpEditor.setShowOAuthClientFields}
        fieldErrors={notebookMcpEditor.fieldErrors}
        editorError={notebookMcpEditor.editorError}
        editorSaving={notebookMcpEditor.editorSaving}
        clearFieldError={notebookMcpEditor.clearFieldError}
        getFieldProps={notebookMcpEditor.getFieldProps}
        onSave={notebookMcpEditor.saveConfig}
      />
    </>
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
      <DialogContent data-component="left-sidebar-create-notebook-dialog" className="sm:max-w-md">
        <DialogHeader className="flex flex-col items-center text-center space-y-3">
          <div className="flex size-12 items-center justify-center rounded-full border border-border-weak bg-surface-weak/50 text-icon-brand-base shadow-xs">
            <FolderPlusIcon className="size-5.5" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-lg font-semibold">{props.title}</DialogTitle>
            <DialogDescription className="text-sm text-text-weak max-w-xs mx-auto leading-normal">
              {props.description}
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <Field className="space-y-1.5">
            <FieldLabel className="text-xs font-semibold text-text-weak uppercase tracking-wider">
              {language.t("sidebar.newNotebookPlaceholder")}
            </FieldLabel>
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
              className="h-10 text-sm px-3 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
            />
          </Field>

          {props.enableLearnerMemory !== undefined && (
            <div className="rounded-xl border border-border-base/50 bg-surface-raised-base/50 p-4 space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-text-strong">
                    {language.t("sidebar.notebookLearnerMemory")}
                  </span>
                  <p className="text-xs text-text-weak leading-normal">
                    {language.t("sidebar.notebookSettingsLearnerMemorySectionDescription")}
                  </p>
                </div>
                <Switch
                  checked={props.enableLearnerMemory}
                  onCheckedChange={props.onLearnerMemoryChange}
                  disabled={props.busy}
                />
              </div>

              {props.enableAutoExtract !== undefined && (
                <div
                  className={cn(
                    "border-t border-border-weak/60 pt-4 flex items-start justify-between gap-4 transition-opacity duration-200",
                    !props.enableLearnerMemory && "opacity-40 pointer-events-none",
                  )}
                >
                  <div className="space-y-1 pl-2">
                    <span className="text-sm font-semibold text-text-strong">
                      {language.t("sidebar.notebookLearnerMemoryAutoExtract")}
                    </span>
                    <p className="text-xs text-text-weak leading-normal">
                      {language.t("settings.notebook.learnerMemoryAutoExtractDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={props.enableAutoExtract}
                    onCheckedChange={props.onAutoExtractChange}
                    disabled={props.busy || !props.enableLearnerMemory}
                  />
                </div>
              )}
            </div>
          )}

          {props.onOpenExistingFolder && (
            <div className="flex items-center justify-between gap-4 border-t border-border-weak/60 pt-4 px-1">
              <div className="space-y-0.5 min-w-0 flex-1">
                <span className="text-xs font-semibold text-text-strong block">
                  {language.t("sidebar.openExistingFolder")}
                </span>
                <span className="text-xs text-text-weak block leading-normal">
                  {language.t("sidebar.openExistingFolderTooltip")}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={props.onOpenExistingFolder}
                className="h-8 text-xs shrink-0 active:scale-[0.97] transition-transform"
              >
                <FolderOpenIcon className="size-3.5 mr-1.5" />
                Open
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            data-action="left-sidebar-create-notebook-cancel"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.busy}
            className="active:scale-[0.97] transition-transform"
          >
            {language.t("common.cancel")}
          </Button>
          <Button
            data-action="left-sidebar-create-notebook-confirm"
            onClick={props.onCreate}
            disabled={props.busy || !props.notebookName.trim()}
            className="active:scale-[0.97] transition-transform"
          >
            {props.busy ? language.t("common.saving") : props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
