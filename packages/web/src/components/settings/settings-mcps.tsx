import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge, Button, Input } from "@buddy/ui"
import { language } from "@/context/language"
import {
  buildConfigFromDraft,
  buildDraft,
  emptyDraft,
  formatMcpError,
  getFieldErrorId,
  parseMcpConfigMap,
  type McpConfig,
  type McpEditorMode,
  type McpFieldErrors,
  type McpFieldName,
  type McpFormDraft,
} from "@/components/mcp-dialog/mcp-config-schema"
import { McpEditorDialog } from "@/components/mcp-dialog/mcp-editor-dialog"
import { reloadProviderRuntime } from "@/lib/provider-auth"
import { removeGlobalMcpConfig, resyncDirectory, saveGlobalMcpConfig } from "@/state/chat-actions"
import { globalConfigQueryOptions, setGlobalConfigQueryData } from "@/state/global-config-query"
import { useChatStore } from "@/state/chat-store"
import { SettingsContent } from "./settings-primitives"

const MCP_SEARCH_VISIBLE_THRESHOLD = 3

function isEnabledLabel(config: McpConfig) {
  return config.enabled === false
    ? language.t("mcp.settings.defaultOff")
    : language.t("mcp.settings.defaultOn")
}

export function McpsSettings() {
  const queryClient = useQueryClient()
  const openProjects = useChatStore((state) => state.openProjects)
  const [query, setQuery] = useState("")
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<McpEditorMode>("create")
  const [draft, setDraft] = useState<McpFormDraft>(() => emptyDraft())
  const [showOAuthClientFields, setShowOAuthClientFields] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<McpFieldErrors>({})
  const [editorError, setEditorError] = useState<string | undefined>(undefined)
  const [editorSaving, setEditorSaving] = useState(false)
  const [panelError, setPanelError] = useState<string | undefined>(undefined)
  const [pendingRemoveName, setPendingRemoveName] = useState<string | null>(null)
  const globalConfigQuery = useQuery(globalConfigQueryOptions())

  const configByName = useMemo(
    () => parseMcpConfigMap(globalConfigQuery.data ?? {}),
    [globalConfigQuery.data],
  )
  const allNames = useMemo(
    () => Object.keys(configByName).sort((left, right) => left.localeCompare(right)),
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

  function clearFieldError(field: McpFieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function getFieldProps(field: McpFieldName, describedBy?: string) {
    const error = fieldErrors[field]
    const errorId = error ? getFieldErrorId(field) : undefined
    const describedByIds = [describedBy, errorId].filter(Boolean).join(" ")

    return {
      "aria-describedby": describedByIds || undefined,
      "aria-errormessage": errorId,
      "aria-invalid": error ? true : undefined,
    } as const
  }

  function openCreateEditor() {
    setEditorMode("create")
    setDraft(emptyDraft())
    setShowOAuthClientFields(false)
    setFieldErrors({})
    setEditorError(undefined)
    setPanelError(undefined)
    setEditorOpen(true)
  }

  function openEditEditor(name: string) {
    const config = configByName[name]
    if (!config) {
      return
    }

    setEditorMode("edit")
    setDraft(buildDraft(name, config))
    setShowOAuthClientFields(
      config.type === "remote" &&
        typeof config.oauth === "object" &&
        Object.keys(config.oauth).length > 0,
    )
    setFieldErrors({})
    setEditorError(undefined)
    setPanelError(undefined)
    setEditorOpen(true)
  }

  function onEditorOpenChange(nextOpen: boolean) {
    if (editorSaving) {
      return
    }

    if (!nextOpen) {
      setFieldErrors({})
      setEditorError(undefined)
    }

    setEditorOpen(nextOpen)
  }

  async function reloadOpenNotebookMcpRuntimes() {
    await reloadProviderRuntime()
    await Promise.allSettled(openProjects.map((directory) => resyncDirectory(directory)))
  }

  async function saveConfig() {
    const parsed = buildConfigFromDraft(draft)
    if ("fieldError" in parsed) {
      setFieldErrors({
        [parsed.fieldError.field]: parsed.fieldError.message,
      })
      setEditorError(undefined)
      return
    }

    setEditorSaving(true)
    setFieldErrors({})
    setEditorError(undefined)
    setPanelError(undefined)

    try {
      const updatedGlobal = await saveGlobalMcpConfig(parsed.name, parsed.config)
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      await reloadOpenNotebookMcpRuntimes()
      setEditorOpen(false)
    } catch (saveError) {
      setEditorError(formatMcpError(saveError))
    } finally {
      setEditorSaving(false)
    }
  }

  async function removeConfig(name: string) {
    setPendingRemoveName(name)
    setPanelError(undefined)

    try {
      const updatedGlobal = await removeGlobalMcpConfig(name)
      setGlobalConfigQueryData(queryClient, updatedGlobal)
      await reloadOpenNotebookMcpRuntimes()
      if (editorMode === "edit" && draft.name === name) {
        setEditorOpen(false)
      }
    } catch (removeError) {
      setPanelError(formatMcpError(removeError))
    } finally {
      setPendingRemoveName(null)
    }
  }

  return (
    <>
      <SettingsContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border-base/60 bg-surface-weak/20 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-base">
                {language.t("mcp.listPanel.title")}
              </p>
              <p className="text-xs text-text-weak">{language.t("mcp.settings.description")}</p>
            </div>
            <Button type="button" size="sm" className="shrink-0" onClick={openCreateEditor}>
              {language.t("mcp.listPanel.addMcp")}
            </Button>
          </div>

          {showSearch ? (
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={language.t("mcp.listPanel.filterPlaceholder")}
            />
          ) : null}

          <div className="rounded-xl border border-border-base/60 bg-surface-raised-base">
            {globalConfigQuery.isPending ? (
              <div className="px-4 py-8 text-sm text-text-weak">
                {language.t("mcp.listPanel.loading")}
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-4 py-8 text-sm text-text-weak">
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
              entries.map((name, index) => {
                const config = configByName[name]
                const removing = pendingRemoveName === name

                return (
                  <div
                    key={name}
                    className={
                      index === 0 ? "px-4 py-3" : "border-t border-border-base/60 px-4 py-3"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-text-base">{name}</p>
                          <Badge variant="outline" className="h-5">
                            {isEnabledLabel(config)}
                          </Badge>
                          <Badge variant="secondary" className="h-5">
                            {config.type}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-text-weak">
                          {config.type === "remote" ? config.url : config.command.join(" ")}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => openEditEditor(name)}
                          disabled={removing}
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
                          disabled={removing}
                        >
                          {removing ? language.t("common.saving") : language.t("common.remove")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {panelError ? <p className="text-sm text-icon-critical-base">{panelError}</p> : null}
          {globalConfigQuery.error ? (
            <p className="text-sm text-icon-critical-base">
              {formatMcpError(globalConfigQuery.error)}
            </p>
          ) : null}
        </div>
      </SettingsContent>

      <McpEditorDialog
        open={editorOpen}
        onOpenChange={onEditorOpenChange}
        mode={editorMode}
        draft={draft}
        setDraft={setDraft}
        showOAuthClientFields={showOAuthClientFields}
        setShowOAuthClientFields={setShowOAuthClientFields}
        fieldErrors={fieldErrors}
        editorError={editorError}
        editorSaving={editorSaving}
        clearFieldError={clearFieldError}
        getFieldProps={getFieldProps}
        onSave={saveConfig}
      />
    </>
  )
}
