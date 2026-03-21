import { useState } from "react"
import { disconnectMcpServer, saveProjectMcpConfig } from "@/state/chat-actions"
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
} from "./mcp-config-schema"

type UseMcpEditorStateProps = {
  directory: string
  configByName: Record<string, McpConfig>
  setConfigByName: (next: Record<string, McpConfig>) => void
  setError: (value: string | undefined) => void
  enableMcp: (name: string) => Promise<unknown>
}

export type McpEditorState = {
  editorOpen: boolean
  editorMode: McpEditorMode
  draft: McpFormDraft
  editorError?: string
  fieldErrors: McpFieldErrors
  editorSaving: boolean
  showOAuthClientFields: boolean
  setShowOAuthClientFields: (next: boolean | ((current: boolean) => boolean)) => void
  setDraft: (next: McpFormDraft | ((current: McpFormDraft) => McpFormDraft)) => void
  clearFieldError: (field: McpFieldName) => void
  getFieldProps: (
    field: McpFieldName,
    describedBy?: string,
  ) => {
    "aria-describedby": string | undefined
    "aria-errormessage": string | undefined
    "aria-invalid": true | undefined
  }
  openCreateEditor: () => void
  openEditEditor: (name: string) => void
  onEditorOpenChange: (nextOpen: boolean) => void
  saveConfig: () => Promise<void>
}

export function useMcpEditorState(props: UseMcpEditorStateProps): McpEditorState {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<McpEditorMode>("create")
  const [editorError, setEditorError] = useState<string | undefined>(undefined)
  const [fieldErrors, setFieldErrors] = useState<McpFieldErrors>({})
  const [editorSaving, setEditorSaving] = useState(false)
  const [showOAuthClientFields, setShowOAuthClientFields] = useState(false)
  const [draft, setDraft] = useState<McpFormDraft>(() => emptyDraft())

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
    setEditorError(undefined)
    setFieldErrors({})
    setEditorOpen(true)
  }

  function openEditEditor(name: string) {
    const config = props.configByName[name]
    if (!config) return
    setEditorMode("edit")
    setDraft(buildDraft(name, config))
    setShowOAuthClientFields(
      config.type === "remote" && typeof config.oauth === "object" && Object.keys(config.oauth).length > 0,
    )
    setEditorError(undefined)
    setFieldErrors({})
    setEditorOpen(true)
  }

  function onEditorOpenChange(nextOpen: boolean) {
    if (editorSaving) return
    if (!nextOpen) {
      setEditorError(undefined)
      setFieldErrors({})
    }
    setEditorOpen(nextOpen)
  }

  async function saveConfig() {
    if (!props.directory) return

    const parsed = buildConfigFromDraft(draft)
    if ("fieldError" in parsed) {
      setFieldErrors({
        [parsed.fieldError.field]: parsed.fieldError.message,
      })
      setEditorError(undefined)
      return
    }

    setEditorSaving(true)
    setEditorError(undefined)
    setFieldErrors({})
    props.setError(undefined)

    try {
      const updated = await saveProjectMcpConfig(props.directory, parsed.name, parsed.config as Record<string, unknown>)
      props.setConfigByName(parseMcpConfigMap(updated))
      if (parsed.config.enabled === false) {
        await disconnectMcpServer(props.directory, parsed.name)
      } else {
        await props.enableMcp(parsed.name)
      }
      setEditorOpen(false)
    } catch (saveError) {
      setEditorError(formatMcpError(saveError))
    } finally {
      setEditorSaving(false)
    }
  }

  return {
    editorOpen,
    editorMode,
    draft,
    editorError,
    fieldErrors,
    editorSaving,
    showOAuthClientFields,
    setShowOAuthClientFields,
    setDraft,
    clearFieldError,
    getFieldProps,
    openCreateEditor,
    openEditEditor,
    onEditorOpenChange,
    saveConfig,
  }
}
