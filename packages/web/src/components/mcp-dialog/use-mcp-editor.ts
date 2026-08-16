import { parseTJsonObject } from "@/components/chat/tools/types"
import { useState, type Dispatch, type SetStateAction } from "react"
import {
  buildConfigFromDraft,
  buildDraft,
  emptyDraft,
  formatMcpError,
  getFieldErrorId,
  type McpConfig,
  type McpEditorMode,
  type McpFieldErrors,
  type McpFieldName,
  type McpFormDraft,
} from "./mcp-config-schema"

type McpEditorFieldProps = {
  "aria-describedby": string | undefined
  "aria-errormessage": string | undefined
  "aria-invalid": true | undefined
}

export type McpEditorSaveInput = {
  name: string
  config: McpConfig
}

export type UseMcpEditorOptions = {
  onSave: (input: McpEditorSaveInput) => Promise<void>
}

export type McpEditorState = {
  editorOpen: boolean
  editorMode: McpEditorMode
  draft: McpFormDraft
  setDraft: Dispatch<SetStateAction<McpFormDraft>>
  showOAuthClientFields: boolean
  setShowOAuthClientFields: Dispatch<SetStateAction<boolean>>
  fieldErrors: McpFieldErrors
  editorError: string | undefined
  editorSaving: boolean
  clearFieldError: (field: McpFieldName) => void
  getFieldProps: (field: McpFieldName, describedBy?: string) => McpEditorFieldProps
  openCreateEditor: () => void
  openEditEditor: (name: string, config: McpConfig) => void
  onEditorOpenChange: (nextOpen: boolean) => void
  saveConfig: () => Promise<void>
}

export function useMcpEditor(options: UseMcpEditorOptions): McpEditorState {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<McpEditorMode>("create")
  const [draft, setDraft] = useState<McpFormDraft>(() => emptyDraft())
  const [showOAuthClientFields, setShowOAuthClientFields] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<McpFieldErrors>({})
  const [editorError, setEditorError] = useState<string | undefined>(undefined)
  const [editorSaving, setEditorSaving] = useState(false)

  function clearFieldError(field: McpFieldName) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current
      }

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function getFieldProps(field: McpFieldName, describedBy?: string): McpEditorFieldProps {
    const error = fieldErrors[field]
    const errorId = error ? getFieldErrorId(field) : undefined
    const describedByIds = [describedBy, errorId].filter(Boolean).join(" ")

    return {
      "aria-describedby": describedByIds || undefined,
      "aria-errormessage": errorId,
      "aria-invalid": error ? true : undefined,
    }
  }

  function openCreateEditor() {
    setEditorMode("create")
    setDraft(emptyDraft())
    setShowOAuthClientFields(false)
    setFieldErrors({})
    setEditorError(undefined)
    setEditorOpen(true)
  }

  function openEditEditor(name: string, config: McpConfig) {
    setEditorMode("edit")
    setDraft(buildDraft(name, config))
    const oauthObject =
      config.type === "remote" && config.oauth !== false ? parseTJsonObject(config.oauth) : undefined
    setShowOAuthClientFields(oauthObject !== undefined && Object.keys(oauthObject).length > 0)
    setFieldErrors({})
    setEditorError(undefined)
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

    try {
      await options.onSave({
        name: parsed.name,
        config: parsed.config,
      })
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
    setDraft,
    showOAuthClientFields,
    setShowOAuthClientFields,
    fieldErrors,
    editorError,
    editorSaving,
    clearFieldError,
    getFieldProps,
    openCreateEditor,
    openEditEditor,
    onEditorOpenChange,
    saveConfig,
  }
}
