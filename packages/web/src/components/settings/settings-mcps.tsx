import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge, Button, Input, Switch } from "@buddy/ui"
import { language } from "@/context/language"
import {
  formatMcpError,
  getMcpStatusLabel,
  mcpNeedsAuth,
  mcpNeedsClientRegistration,
  parseMcpConfigMap,
} from "@/components/mcp-dialog/mcp-config-schema"
import { McpEditorDialog } from "@/components/mcp-dialog/mcp-editor-dialog"
import { useMcpEditor } from "@/components/mcp-dialog/use-mcp-editor"
import { reloadProviderRuntime } from "@/lib/provider-auth"
import {
  authenticateMcpServer,
  connectMcpServer,
  removeGlobalMcpConfig,
  resyncDirectory,
  saveGlobalMcpConfig,
} from "@/state/chat-actions"
import type { McpStatusInfo, McpStatusMap } from "@/state/chat-types"
import { globalConfigQueryOptions, setGlobalConfigQueryData } from "@/state/global-config-query"
import { mcpStatusQueryOptions } from "@/state/mcp-directory-query"
import { notebookDefinesMcp } from "@/state/mcp-settings"
import { notebookRawProjectConfigQueryOptions } from "@/state/notebook-settings-query"
import { EMPTY_BUDDY_CONFIG } from "@/state/parse-external"
import { useChatStore } from "@/state/chat-store"
import { SettingsContent, SettingsListCard, SettingsRow } from "./settings-primitives"

const MCP_SEARCH_VISIBLE_THRESHOLD = 3
const EMPTY_MCP_STATUS: McpStatusMap = {}

function getConnectButtonLabel(input: { pending: boolean; status: McpStatusInfo | undefined }) {
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

export function McpsSettings() {
  const queryClient = useQueryClient()
  const openProjects = useChatStore((state) => state.openProjects)
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const connectionDirectory = activeDirectory ?? openProjects[0]
  const [query, setQuery] = useState("")
  const [panelError, setPanelError] = useState<string | undefined>(undefined)
  const [pendingRemoveName, setPendingRemoveName] = useState<string | null>(null)
  const [pendingConnectName, setPendingConnectName] = useState<string | null>(null)
  const [pendingEnabledName, setPendingEnabledName] = useState<string | null>(null)
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const activeMcpStatusQuery = useQuery({
    ...mcpStatusQueryOptions(connectionDirectory ?? ""),
    enabled: Boolean(connectionDirectory),
  })
  const activeProjectConfigQuery = useQuery({
    ...notebookRawProjectConfigQueryOptions(connectionDirectory ?? ""),
    enabled: Boolean(connectionDirectory),
  })
  const activeProjectConfig = activeProjectConfigQuery.data ?? EMPTY_BUDDY_CONFIG
  const activeMcpStatusByName = activeMcpStatusQuery.data ?? EMPTY_MCP_STATUS

  const mcpEditor = useMcpEditor({
    onSave: async ({ name, config }) => {
      setPanelError(undefined)
      const updatedGlobal = await saveGlobalMcpConfig(name, config)
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      await reloadOpenNotebookMcpRuntimes()
    },
  })

  const configByName = useMemo(
    () => parseMcpConfigMap(globalConfigQuery.data ?? {}),
    [globalConfigQuery.data],
  )
  const allNames = useMemo(
    () => Object.keys(configByName).toSorted((left, right) => left.localeCompare(right)),
    [configByName],
  )
  const showSearch = allNames.length >= MCP_SEARCH_VISIBLE_THRESHOLD
  const entries = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) {
      return allNames
    }

    return allNames.filter((name) => name.toLowerCase().includes(search))
  }, [allNames, query])

  function openCreateEditor() {
    setPanelError(undefined)
    mcpEditor.openCreateEditor()
  }

  function openEditEditor(name: string) {
    const config = configByName[name]
    if (!config) {
      return
    }

    setPanelError(undefined)
    mcpEditor.openEditEditor(name, config)
  }

  async function reloadOpenNotebookMcpRuntimes() {
    await reloadProviderRuntime()
    await Promise.allSettled(
      openProjects.map(async (directory) => {
        await resyncDirectory(directory)
        await queryClient.invalidateQueries({
          queryKey: mcpStatusQueryOptions(directory).queryKey,
        })
      }),
    )
  }

  async function removeConfig(name: string) {
    setPendingRemoveName(name)
    setPanelError(undefined)

    try {
      const updatedGlobal = await removeGlobalMcpConfig(name)
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      await reloadOpenNotebookMcpRuntimes()
      if (mcpEditor.editorMode === "edit" && mcpEditor.draft.name === name) {
        mcpEditor.onEditorOpenChange(false)
      }
    } catch (removeError) {
      setPanelError(formatMcpError(removeError))
    } finally {
      setPendingRemoveName(null)
    }
  }

  async function setConfigEnabled(name: string, enabled: boolean) {
    const config = configByName[name]
    if (!config) {
      return
    }

    setPendingEnabledName(name)
    setPanelError(undefined)

    try {
      const updatedGlobal = await saveGlobalMcpConfig(name, { ...config, enabled })
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      await reloadOpenNotebookMcpRuntimes()
    } catch (enabledError) {
      setPanelError(formatMcpError(enabledError))
    } finally {
      setPendingEnabledName(null)
    }
  }

  async function connectConfig(name: string) {
    if (
      !connectionDirectory ||
      !activeProjectConfigQuery.isSuccess ||
      notebookDefinesMcp(activeProjectConfig, name)
    ) {
      return
    }

    const status = activeMcpStatusByName[name]
    if (mcpNeedsClientRegistration(status)) {
      openEditEditor(name)
      return
    }

    setPendingConnectName(name)
    setPanelError(undefined)

    try {
      if (mcpNeedsAuth(status)) {
        await authenticateMcpServer(connectionDirectory, name)
      } else {
        const nextStatusByName = await connectMcpServer(connectionDirectory, name)
        if (mcpNeedsAuth(nextStatusByName[name])) {
          await authenticateMcpServer(connectionDirectory, name)
        }
        if (mcpNeedsClientRegistration(nextStatusByName[name])) {
          openEditEditor(name)
        }
      }

      await queryClient.invalidateQueries({
        queryKey: mcpStatusQueryOptions(connectionDirectory).queryKey,
      })
    } catch (connectError) {
      setPanelError(formatMcpError(connectError))
    } finally {
      setPendingConnectName(null)
    }
  }

  return (
    <>
      <SettingsContent>
        <div className="space-y-4">
          <SettingsListCard>
            <SettingsRow
              title={language.t("mcp.listPanel.title")}
              description={language.t("mcp.settings.description")}
              control={
                <Button type="button" size="sm" className="shrink-0" onClick={openCreateEditor}>
                  {language.t("mcp.listPanel.addMcp")}
                </Button>
              }
            />
          </SettingsListCard>

          {showSearch ? (
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={language.t("mcp.listPanel.filterPlaceholder")}
            />
          ) : null}

          <SettingsListCard>
            {globalConfigQuery.isPending ? (
              <div className="px-4 py-8 text-sm text-text-weaker">
                {language.t("mcp.listPanel.loading")}
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-4 py-8 text-sm text-text-weaker">
                <p>
                  {showSearch
                    ? language.t("mcp.listPanel.noMatch")
                    : language.t("mcp.settings.emptyDescription")}
                </p>
                {!showSearch ? (
                  <Button type="button" size="sm" variant="outline" onClick={openCreateEditor}>
                    {language.t("mcp.listPanel.addFirstMcp")}
                  </Button>
                ) : null}
              </div>
            ) : (
              entries.map((name) => {
                const config = configByName[name]
                const removing = pendingRemoveName === name
                const notebookDefinitionShadowsGlobal = notebookDefinesMcp(
                  activeProjectConfig,
                  name,
                )
                const connectionTargetReady =
                  activeProjectConfigQuery.isSuccess && !notebookDefinitionShadowsGlobal
                const status = connectionTargetReady ? activeMcpStatusByName[name] : undefined
                const connecting = pendingConnectName === name
                const updatingEnabled = pendingEnabledName === name
                const rowBusy = removing || connecting || updatingEnabled
                const showConnectAction =
                  Boolean(connectionDirectory) &&
                  connectionTargetReady &&
                  config.enabled !== false &&
                  status?.status !== "connected" &&
                  status?.status !== "disabled"
                const detail = config.type === "remote" ? config.url : config.command.join(" ")

                return (
                  <SettingsRow
                    key={name}
                    title={
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate">{name}</span>
                        <Badge variant="secondary" className="h-5">
                          {config.type}
                        </Badge>
                        {status ? (
                          <Badge variant="outline" className="h-5">
                            {getMcpStatusLabel(status.status)}
                          </Badge>
                        ) : null}
                      </span>
                    }
                    description={detail}
                    control={
                      <>
                        <Switch
                          data-action={`settings-mcp-enabled-${name}`}
                          checked={config.enabled !== false}
                          disabled={rowBusy}
                          aria-label={language.t("mcp.settings.toggleAria", { name })}
                          onCheckedChange={(checked) => {
                            void setConfigEnabled(name, checked)
                          }}
                        />
                        {showConnectAction ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              void connectConfig(name)
                            }}
                            disabled={rowBusy}
                          >
                            {getConnectButtonLabel({ pending: connecting, status })}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => openEditEditor(name)}
                          disabled={rowBusy}
                        >
                          {language.t("mcp.listPanel.editDetails")}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            void removeConfig(name)
                          }}
                          disabled={rowBusy}
                        >
                          {removing ? language.t("common.saving") : language.t("common.remove")}
                        </Button>
                      </>
                    }
                  />
                )
              })
            )}
          </SettingsListCard>

          {panelError ? <p className="text-sm text-icon-critical-base">{panelError}</p> : null}
          {globalConfigQuery.error ? (
            <p className="text-sm text-icon-critical-base">
              {formatMcpError(globalConfigQuery.error)}
            </p>
          ) : null}
          {activeMcpStatusQuery.error ? (
            <p className="text-sm text-icon-critical-base">
              {formatMcpError(activeMcpStatusQuery.error)}
            </p>
          ) : null}
          {activeProjectConfigQuery.error ? (
            <p className="text-sm text-icon-critical-base">
              {formatMcpError(activeProjectConfigQuery.error)}
            </p>
          ) : null}
        </div>
      </SettingsContent>

      <McpEditorDialog
        open={mcpEditor.editorOpen}
        onOpenChange={mcpEditor.onEditorOpenChange}
        mode={mcpEditor.editorMode}
        draft={mcpEditor.draft}
        setDraft={mcpEditor.setDraft}
        showOAuthClientFields={mcpEditor.showOAuthClientFields}
        setShowOAuthClientFields={mcpEditor.setShowOAuthClientFields}
        fieldErrors={mcpEditor.fieldErrors}
        editorError={mcpEditor.editorError}
        editorSaving={mcpEditor.editorSaving}
        clearFieldError={mcpEditor.clearFieldError}
        getFieldProps={mcpEditor.getFieldProps}
        onSave={mcpEditor.saveConfig}
      />
    </>
  )
}
