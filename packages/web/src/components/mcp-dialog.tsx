import { useEffect, useMemo, useState } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Textarea,
} from "@buddy/ui"
import { stringifyError } from "../lib/api-client"
import { useChatStore } from "@/state/chat-store"
import {
  authenticateMcpServer,
  connectMcpServer,
  disconnectMcpServer,
  loadMcpStatus,
  loadProjectConfig,
  saveProjectMcpConfig,
} from "@/state/chat-actions"

type McpDialogProps = {
  directory: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type McpLocalConfig = {
  type: "local"
  command: string[]
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

type McpRemoteConfig = {
  type: "remote"
  url: string
  enabled?: boolean
  headers?: Record<string, string>
  oauth?: false | {
    clientId?: string
    clientSecret?: string
    scope?: string
  }
  timeout?: number
}

type McpConfig = McpLocalConfig | McpRemoteConfig

type McpEditorMode = "create" | "edit"

type McpFormDraft = {
  name: string
  type: "local" | "remote"
  enabled: boolean
  timeout: string
  url: string
  command: string
  headersText: string
  environmentText: string
  oauthEnabled: boolean
  clientId: string
  clientSecret: string
  scope: string
}

const STATUS_LABELS = {
  connected: "Connected",
  disabled: "Disabled",
  failed: "Failed",
  needs_auth: "Needs auth",
  needs_client_registration: "Needs client registration",
} as const

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === "string")
}

function parseMcpConfigMap(config: Record<string, unknown>) {
  const raw = config.mcp
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {} as Record<string, McpConfig>
  }

  const entries: Record<string, McpConfig> = {}

  for (const [name, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue

    const candidate = value as Record<string, unknown>

    if (candidate.type === "local" && Array.isArray(candidate.command) && candidate.command.every((item) => typeof item === "string")) {
      entries[name] = {
        type: "local",
        command: candidate.command,
        ...(isStringRecord(candidate.environment) ? { environment: candidate.environment } : {}),
        ...(typeof candidate.enabled === "boolean" ? { enabled: candidate.enabled } : {}),
        ...(typeof candidate.timeout === "number" && Number.isInteger(candidate.timeout) && candidate.timeout > 0
          ? { timeout: candidate.timeout }
          : {}),
      }
      continue
    }

    if (candidate.type === "remote" && typeof candidate.url === "string") {
      const oauth =
        candidate.oauth === false
          ? false
          : candidate.oauth && typeof candidate.oauth === "object" && !Array.isArray(candidate.oauth)
            ? (() => {
                const oauthValue = candidate.oauth as Record<string, unknown>
                return {
                  ...(typeof oauthValue.clientId === "string" ? { clientId: oauthValue.clientId } : {}),
                  ...(typeof oauthValue.clientSecret === "string"
                    ? { clientSecret: oauthValue.clientSecret }
                    : {}),
                  ...(typeof oauthValue.scope === "string" ? { scope: oauthValue.scope } : {}),
                }
              })()
            : undefined

      entries[name] = {
        type: "remote",
        url: candidate.url,
        ...(isStringRecord(candidate.headers) ? { headers: candidate.headers } : {}),
        ...(typeof candidate.enabled === "boolean" ? { enabled: candidate.enabled } : {}),
        ...(oauth !== undefined ? { oauth } : {}),
        ...(typeof candidate.timeout === "number" && Number.isInteger(candidate.timeout) && candidate.timeout > 0
          ? { timeout: candidate.timeout }
          : {}),
      }
    }
  }

  return entries
}

function emptyDraft(): McpFormDraft {
  return {
    name: "",
    type: "remote",
    enabled: true,
    timeout: "",
    url: "",
    command: "",
    headersText: "",
    environmentText: "",
    oauthEnabled: true,
    clientId: "",
    clientSecret: "",
    scope: "",
  }
}

function buildDraft(name: string, config: McpConfig): McpFormDraft {
  if (config.type === "local") {
    return {
      name,
      type: "local",
      enabled: config.enabled !== false,
      timeout: typeof config.timeout === "number" ? String(config.timeout) : "",
      url: "",
      command: JSON.stringify(config.command, null, 2),
      headersText: "",
      environmentText: config.environment ? JSON.stringify(config.environment, null, 2) : "",
      oauthEnabled: false,
      clientId: "",
      clientSecret: "",
      scope: "",
    }
  }

  const oauthObject = config.oauth && typeof config.oauth === "object" ? config.oauth : undefined

  return {
    name,
    type: "remote",
    enabled: config.enabled !== false,
    timeout: typeof config.timeout === "number" ? String(config.timeout) : "",
    url: config.url,
    command: "",
    headersText: config.headers ? JSON.stringify(config.headers, null, 2) : "",
    environmentText: "",
    oauthEnabled: config.oauth !== false,
    clientId: oauthObject?.clientId ?? "",
    clientSecret: oauthObject?.clientSecret ?? "",
    scope: oauthObject?.scope ?? "",
  }
}

function parseOptionalStringMap(label: string, value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return {
      value: undefined,
    } as const
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isStringRecord(parsed)) {
      return {
        error: `${label} must be a JSON object with string values.`,
      } as const
    }
    return {
      value: parsed,
    } as const
  } catch {
    return {
      error: `${label} must be valid JSON.`,
    } as const
  }
}

function buildConfigFromDraft(draft: McpFormDraft) {
  const name = draft.name.trim()
  if (!name) {
    return {
      error: "Name is required.",
    } as const
  }

  const timeoutValue = draft.timeout.trim()
  const timeout =
    timeoutValue.length > 0
      ? Number.parseInt(timeoutValue, 10)
      : undefined

  if (timeoutValue.length > 0 && (!Number.isInteger(timeout) || !timeout || timeout <= 0)) {
    return {
      error: "Timeout must be a positive integer.",
    } as const
  }

  if (draft.type === "local") {
    const commandInput = draft.command.trim()
    if (!commandInput) {
      return {
        error: "Local command is required.",
      } as const
    }

    const command = (() => {
      try {
        const parsed = JSON.parse(commandInput) as unknown
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          return {
            value: parsed,
          } as const
        }
        return {
          error: "Local command must be a JSON array of strings.",
        } as const
      } catch {
        return {
          value: commandInput.split(/\s+/),
        } as const
      }
    })()

    if (command.error) {
      return {
        error: command.error,
      } as const
    }

    const environment = parseOptionalStringMap("Environment", draft.environmentText)
    if (environment.error) {
      return {
        error: environment.error,
      } as const
    }

    return {
      name,
      config: {
        type: "local" as const,
        command: command.value,
        enabled: draft.enabled,
        ...(environment.value ? { environment: environment.value } : {}),
        ...(timeout ? { timeout } : {}),
      } satisfies McpConfig,
    } as const
  }

  const url = draft.url.trim()
  if (!url) {
    return {
      error: "Remote URL is required.",
    } as const
  }

  try {
    new URL(url)
  } catch {
    return {
      error: "Remote URL must be valid.",
    } as const
  }

  const headers = parseOptionalStringMap("Headers", draft.headersText)
  if (headers.error) {
    return {
      error: headers.error,
    } as const
  }

  if (draft.oauthEnabled && headers.value?.Authorization) {
    return {
      error: "Remove the Authorization header when OAuth is enabled. Use either OAuth or header-based auth, not both.",
    } as const
  }

  const oauth =
    draft.oauthEnabled
      ? {
          ...(draft.clientId.trim() ? { clientId: draft.clientId.trim() } : {}),
          ...(draft.clientSecret.trim() ? { clientSecret: draft.clientSecret.trim() } : {}),
          ...(draft.scope.trim() ? { scope: draft.scope.trim() } : {}),
        }
      : false

  return {
    name,
    config: {
      type: "remote" as const,
      url,
      enabled: draft.enabled,
      ...(headers.value ? { headers: headers.value } : {}),
      oauth,
      ...(timeout ? { timeout } : {}),
    } satisfies McpConfig,
  } as const
}

export function McpDialog(props: McpDialogProps) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [configByName, setConfigByName] = useState<Record<string, McpConfig>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<McpEditorMode>("create")
  const [editorError, setEditorError] = useState<string | undefined>(undefined)
  const [editorSaving, setEditorSaving] = useState(false)
  const [showOAuthClientFields, setShowOAuthClientFields] = useState(false)
  const [draft, setDraft] = useState<McpFormDraft>(() => emptyDraft())
  const statusByName = useChatStore((state) => state.directories[props.directory]?.mcpStatus ?? {})

  const allNames = useMemo(
    () =>
      Array.from(
      new Set([...Object.keys(statusByName), ...Object.keys(configByName)]),
    )
        .sort((left, right) => left.localeCompare(right)),
    [configByName, statusByName],
  )

  const entries = useMemo(() => {
    const search = query.trim().toLowerCase()
    return allNames.filter((name) => {
        if (!search) return true
        return name.toLowerCase().includes(search)
      })
  }, [allNames, query])
  const showSearch = allNames.length >= 3

  const enabledCount = useMemo(
    () => Object.values(statusByName).filter((entry) => entry.status === "connected").length,
    [statusByName],
  )
  const totalCount = allNames.length

  async function enableMcp(name: string) {
    const status = await connectMcpServer(props.directory, name)
    if (status[name]?.status === "needs_auth") {
      return authenticateMcpServer(props.directory, name)
    }
    return status
  }

  async function refreshData() {
    if (!props.directory) return

    setLoading(true)
    setError(undefined)

    const [statusResult, configResult] = await Promise.allSettled([
      loadMcpStatus(props.directory),
      loadProjectConfig(props.directory),
    ])

    if (configResult.status === "fulfilled") {
      setConfigByName(parseMcpConfigMap(configResult.value))
    }

    if (statusResult.status === "rejected") {
      setError(stringifyError(statusResult.reason))
    } else if (configResult.status === "rejected") {
      setError(stringifyError(configResult.reason))
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!props.open) return
    setQuery("")
    void refreshData()
  }, [props.directory, props.open])

  function openCreateEditor() {
    setEditorMode("create")
    setDraft(emptyDraft())
    setShowOAuthClientFields(false)
    setEditorError(undefined)
    setEditorOpen(true)
  }

  function openEditEditor(name: string) {
    const config = configByName[name]
    if (!config) return
    setEditorMode("edit")
    setDraft(buildDraft(name, config))
    setShowOAuthClientFields(
      config.type === "remote" &&
      config.oauth !== false &&
      !!config.oauth &&
      Object.keys(config.oauth).length > 0,
    )
    setEditorError(undefined)
    setEditorOpen(true)
  }

  async function toggleMcp(name: string) {
    if (!props.directory || pendingName) return

    const current = statusByName[name]
    setPendingName(name)
    setError(undefined)
    try {
      if (current?.status === "connected") {
        await disconnectMcpServer(props.directory, name)
      } else {
        await enableMcp(name)
      }
    } catch (toggleError) {
      setError(stringifyError(toggleError))
    } finally {
      setPendingName(null)
    }
  }

  async function saveConfig() {
    if (!props.directory) return

    const parsed = buildConfigFromDraft(draft)
    if ("error" in parsed) {
      setEditorError(parsed.error)
      return
    }

    setEditorSaving(true)
    setEditorError(undefined)

    try {
      const updated = await saveProjectMcpConfig(props.directory, parsed.name, parsed.config as Record<string, unknown>)

      setConfigByName(parseMcpConfigMap(updated))
      if (parsed.config.enabled === false) {
        await disconnectMcpServer(props.directory, parsed.name)
      } else {
        await enableMcp(parsed.name)
      }
      setEditorOpen(false)
    } catch (saveError) {
      setEditorError(stringifyError(saveError))
    } finally {
      setEditorSaving(false)
    }
  }

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>MCPs</DialogTitle>
            <DialogDescription>{`${enabledCount} of ${totalCount} enabled`}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Server definitions</p>
              <p className="text-xs text-muted-foreground">
                {allNames.length > 0
                  ? "Manage saved MCPs here. Use search below to filter the list."
                  : "Add an MCP to save it to this project's buddy.jsonc."}
              </p>
            </div>
            <Button type="button" size="sm" className="shrink-0" onClick={openCreateEditor}>
              Add MCP
            </Button>
          </div>

          {showSearch ? (
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter MCP servers"
              autoFocus
            />
          ) : null}

          <div className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto rounded-xl border">
            {entries.length > 0 ? (
              entries.map((name, index) => {
                const status = statusByName[name]
                const config = configByName[name]
                const enabled = status?.status === "connected"
                const label =
                  status
                    ? (STATUS_LABELS[status.status] ?? status.status)
                    : config?.enabled === false
                      ? "Disabled"
                      : "Configured"
                const isPending = pendingName === name

                return (
                  <div key={name}>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{name}</p>
                          <Badge variant="outline" className="h-5">
                            {label}
                          </Badge>
                          {config ? (
                            <Badge variant="secondary" className="h-5">
                              {config.type}
                            </Badge>
                          ) : null}
                          {isPending ? (
                            <span className="text-xs text-muted-foreground">Updating...</span>
                          ) : null}
                        </div>
                        {status?.error ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">{status.error}</p>
                        ) : config ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {config.type === "remote" ? config.url : config.command.join(" ")}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {config ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => openEditEditor(name)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {status?.status === "needs_auth" ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => {
                              void (async () => {
                                if (!props.directory || pendingName) return
                                setPendingName(name)
                                setError(undefined)
                                try {
                                  await authenticateMcpServer(props.directory, name)
                                } catch (authError) {
                                  setError(stringifyError(authError))
                                } finally {
                                  setPendingName(null)
                                }
                              })()
                            }}
                          >
                            Authorize
                          </Button>
                        ) : null}
                        <Switch
                          checked={enabled}
                          disabled={isPending}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}
                          onCheckedChange={() => {
                            void toggleMcp(name)
                          }}
                        />
                      </div>
                    </div>
                    {index === entries.length - 1 ? null : <Separator />}
                  </div>
                )
              })
            ) : (
              <div className="flex flex-col items-start gap-3 px-4 py-8 text-sm text-muted-foreground">
                <p>
                  {loading
                    ? "Loading MCP servers..."
                    : showSearch
                      ? "No MCP servers match your current filter."
                      : "No MCP servers configured yet."}
                </p>
                {!loading && !showSearch ? (
                  <Button type="button" size="sm" variant="outline" onClick={openCreateEditor}>
                    Add your first MCP
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              MCP definitions saved here override or extend this project's config.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editorOpen}
        onOpenChange={(nextOpen) => {
          if (!editorSaving) {
            setEditorOpen(nextOpen)
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editorMode === "create" ? "Add MCP" : `Edit ${draft.name}`}</DialogTitle>
            <DialogDescription>
              Save a project-level MCP definition in this repository's config.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="mcp-name">
                Name
              </label>
              <Input
                id="mcp-name"
                value={draft.name}
                disabled={editorMode === "edit"}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }}
                placeholder="docs"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="mcp-type">
                Type
              </label>
              <Select
                value={draft.type}
                onValueChange={(value) => {
                  if (value !== "local" && value !== "remote") return
                  setDraft((current) => ({
                    ...current,
                    type: value,
                  }))
                }}
                disabled={editorMode === "edit"}
              >
                <SelectTrigger id="mcp-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Enabled by default</p>
                <p className="text-xs text-muted-foreground">Saved as the MCP's initial enabled state.</p>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(checked) => {
                  setDraft((current) => ({
                    ...current,
                    enabled: checked,
                  }))
                }}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="mcp-timeout">
                Timeout (seconds)
              </label>
              <Input
                id="mcp-timeout"
                value={draft.timeout}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    timeout: event.target.value,
                  }))
                }}
                placeholder="30"
                inputMode="numeric"
              />
            </div>

            {draft.type === "remote" ? (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="mcp-url">
                    Remote URL
                  </label>
                  <Input
                    id="mcp-url"
                    value={draft.url}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        url: event.target.value,
                      }))
                    }}
                    placeholder="https://example.com/mcp"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="mcp-headers">
                    Headers (JSON)
                  </label>
                  <Textarea
                    id="mcp-headers"
                    value={draft.headersText}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        headersText: event.target.value,
                      }))
                    }}
                    placeholder={`{\n  "Authorization": "Bearer ..."\n}`}
                    className="min-h-24"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">OAuth</p>
                    <p className="text-xs text-muted-foreground">
                      Remote MCPs use OAuth by default. Leave headers empty for browser login, or turn OAuth off to use an Authorization header instead.
                    </p>
                  </div>
                  <Switch
                    checked={draft.oauthEnabled}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        setShowOAuthClientFields(false)
                      }
                      setDraft((current) => ({
                        ...current,
                        oauthEnabled: checked,
                      }))
                    }}
                  />
                </div>

                {draft.oauthEnabled ? (
                  <div className="grid gap-4 rounded-lg border p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Browser login</p>
                      <p className="text-xs text-muted-foreground">
                        Most hosted MCPs, including Linear, work without any client details here. Save with OAuth on, then toggle the MCP to start the browser login flow.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Custom client details</p>
                        <p className="text-xs text-muted-foreground">
                          Optional. Only use these if the MCP provider gave you a client ID/secret or dynamic registration fails.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowOAuthClientFields((current) => !current)}
                      >
                        {showOAuthClientFields ? "Hide details" : "Add details"}
                      </Button>
                    </div>

                    {showOAuthClientFields ? (
                      <>
                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-foreground" htmlFor="mcp-client-id">
                            Client ID (optional)
                          </label>
                          <Input
                            id="mcp-client-id"
                            value={draft.clientId}
                            onChange={(event) => {
                              setDraft((current) => ({
                                ...current,
                                clientId: event.target.value,
                              }))
                            }}
                          />
                        </div>

                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-foreground" htmlFor="mcp-client-secret">
                            Client secret (optional)
                          </label>
                          <Input
                            id="mcp-client-secret"
                            value={draft.clientSecret}
                            onChange={(event) => {
                              setDraft((current) => ({
                                ...current,
                                clientSecret: event.target.value,
                              }))
                            }}
                          />
                        </div>

                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-foreground" htmlFor="mcp-scope">
                            Scope (optional)
                          </label>
                          <Input
                            id="mcp-scope"
                            value={draft.scope}
                            onChange={(event) => {
                              setDraft((current) => ({
                                ...current,
                                scope: event.target.value,
                              }))
                            }}
                            placeholder="Leave blank to use the server default"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="mcp-command">
                    Local command (argv JSON)
                  </label>
                  <Textarea
                    id="mcp-command"
                    value={draft.command}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        command: event.target.value,
                      }))
                    }}
                    placeholder={`[\n  "npx",\n  "-y",\n  "@modelcontextprotocol/server-filesystem",\n  "/path with spaces"\n]`}
                    className="min-h-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a JSON array to preserve exact argv values, especially when arguments contain spaces. Plain text still works for simple commands.
                  </p>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="mcp-environment">
                    Environment (JSON)
                  </label>
                  <Textarea
                    id="mcp-environment"
                    value={draft.environmentText}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        environmentText: event.target.value,
                      }))
                    }}
                    placeholder={`{\n  "NODE_NO_WARNINGS": "1"\n}`}
                    className="min-h-24"
                  />
                </div>
              </>
            )}
          </div>

          {editorError ? (
            <p className="text-sm text-destructive">{editorError}</p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={editorSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveConfig()} disabled={editorSaving}>
              {editorSaving ? "Saving..." : editorMode === "create" ? "Add MCP" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
