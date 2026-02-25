import type { CSSProperties } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Button,
  NativeSelect,
  NativeSelectOption,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@buddy/ui"
import { Markdown } from "@/components/Markdown"
import {
  loadAgentCatalog,
  loadCurriculum,
  loadProjectConfig,
  loadProviderCatalog,
  patchProjectConfig,
  saveCurriculum,
  type AgentConfigOption,
} from "@/state/chat-actions"
import type { ConfigProvidersResponse } from "@/state/chat-types"
import type { RightSidebarTab } from "@/state/ui-preferences"
import { BookOpenIcon, SettingsIcon, XIcon } from "./sidebar-icons"

type LogLevel = "debug" | "info" | "warn" | "error"

type ChatRightSidebarProps = {
  directory: string
  tab: RightSidebarTab
  onTabChange: (tab: RightSidebarTab) => void
  onClose: () => void
  className?: string
  style?: CSSProperties
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function readString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : ""
}

function parseModel(model: string) {
  if (!model) {
    return {
      providerID: "",
      modelID: "",
    }
  }

  const split = model.indexOf("/")
  if (split <= 0 || split >= model.length - 1) {
    return {
      providerID: "",
      modelID: "",
    }
  }

  return {
    providerID: model.slice(0, split),
    modelID: model.slice(split + 1),
  }
}

export function ChatRightSidebar(props: ChatRightSidebarProps) {
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumSaving, setCurriculumSaving] = useState(false)
  const [curriculumError, setCurriculumError] = useState<string | undefined>(undefined)
  const [curriculumMarkdown, setCurriculumMarkdown] = useState("")
  const [curriculumDraft, setCurriculumDraft] = useState("")
  const [curriculumEditing, setCurriculumEditing] = useState(false)

  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | undefined>(undefined)
  const [projectConfig, setProjectConfig] = useState<Record<string, unknown>>({})
  const [providerCatalog, setProviderCatalog] = useState<ConfigProvidersResponse>({
    providers: [],
    default: {},
  })
  const [agentCatalog, setAgentCatalog] = useState<AgentConfigOption[]>([])
  const [selectedAgent, setSelectedAgent] = useState("")
  const [selectedProvider, setSelectedProvider] = useState("")
  const [selectedModel, setSelectedModel] = useState("")
  const [selectedLogLevel, setSelectedLogLevel] = useState<LogLevel | "">("")

  const providerModels = useMemo(
    () => providerCatalog.providers.find((provider) => provider.id === selectedProvider)?.models ?? [],
    [providerCatalog.providers, selectedProvider],
  )

  useEffect(() => {
    if (props.tab !== "curriculum") return

    let disposed = false
    setCurriculumLoading(true)
    setCurriculumError(undefined)

    loadCurriculum(props.directory)
      .then((markdown) => {
        if (disposed) return
        setCurriculumMarkdown(markdown)
        setCurriculumDraft(markdown)
      })
      .catch((error) => {
        if (disposed) return
        setCurriculumError(stringifyError(error))
      })
      .finally(() => {
        if (disposed) return
        setCurriculumLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [props.directory, props.tab])

  useEffect(() => {
    if (props.tab !== "settings") return

    let disposed = false
    setSettingsLoading(true)
    setSettingsError(undefined)

    Promise.all([loadProjectConfig(props.directory), loadProviderCatalog(props.directory), loadAgentCatalog(props.directory)])
      .then(([config, providerResult, agents]) => {
        if (disposed) return

        const model = parseModel(readString(config, "model"))
        const initialProvider = model.providerID || providerResult.providers[0]?.id || ""
        const providerDefault = providerResult.default[initialProvider]
        const availableModels =
          providerResult.providers.find((provider) => provider.id === initialProvider)?.models ?? []
        const initialModel = model.modelID || providerDefault || availableModels[0]?.id || ""
        const logLevel = readString(config, "logLevel")

        const selectableAgents = agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)
        const configuredDefaultAgent = readString(config, "default_agent")

        setProjectConfig(config)
        setProviderCatalog(providerResult)
        setAgentCatalog(selectableAgents)
        setSelectedAgent(
          configuredDefaultAgent && selectableAgents.some((agent) => agent.name === configuredDefaultAgent)
            ? configuredDefaultAgent
            : "",
        )
        setSelectedProvider(initialProvider)
        setSelectedModel(initialModel)
        setSelectedLogLevel(
          logLevel === "debug" || logLevel === "info" || logLevel === "warn" || logLevel === "error" ? logLevel : "",
        )
      })
      .catch((error) => {
        if (disposed) return
        setSettingsError(stringifyError(error))
      })
      .finally(() => {
        if (disposed) return
        setSettingsLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [props.directory, props.tab])

  async function onReloadCurriculum() {
    setCurriculumLoading(true)
    setCurriculumError(undefined)
    try {
      const markdown = await loadCurriculum(props.directory)
      setCurriculumMarkdown(markdown)
      setCurriculumDraft(markdown)
    } catch (error) {
      setCurriculumError(stringifyError(error))
    } finally {
      setCurriculumLoading(false)
    }
  }

  async function onSaveCurriculum() {
    setCurriculumSaving(true)
    setCurriculumError(undefined)
    try {
      const markdown = await saveCurriculum(props.directory, curriculumDraft)
      setCurriculumMarkdown(markdown)
      setCurriculumDraft(markdown)
      setCurriculumEditing(false)
    } catch (error) {
      setCurriculumError(stringifyError(error))
    } finally {
      setCurriculumSaving(false)
    }
  }

  async function onSaveSettings() {
    const patch: Record<string, unknown> = {}
    const currentAgent = readString(projectConfig, "default_agent")
    const currentModel = readString(projectConfig, "model")
    const currentLogLevel = readString(projectConfig, "logLevel")

    const nextAgent = selectedAgent.trim()
    if (nextAgent !== currentAgent) {
      patch.default_agent = nextAgent
    }

    if (selectedProvider && selectedModel) {
      const nextModel = `${selectedProvider}/${selectedModel}`
      if (nextModel !== currentModel) {
        patch.model = nextModel
      }
    }

    if (selectedLogLevel && selectedLogLevel !== currentLogLevel) {
      patch.logLevel = selectedLogLevel
    }

    if (Object.keys(patch).length === 0) {
      return
    }

    setSettingsSaving(true)
    setSettingsError(undefined)
    try {
      const updated = await patchProjectConfig(props.directory, patch)
      setProjectConfig(updated)
    } catch (error) {
      setSettingsError(stringifyError(error))
    } finally {
      setSettingsSaving(false)
    }
  }

  function onProviderChange(nextProvider: string) {
    setSelectedProvider(nextProvider)
    const models = providerCatalog.providers.find((provider) => provider.id === nextProvider)?.models ?? []
    const defaultModel = providerCatalog.default[nextProvider] ?? models[0]?.id ?? ""
    setSelectedModel(defaultModel)
  }

  return (
    <aside
      className={`shrink-0 border-l bg-card/50 flex flex-col min-h-0 ${props.className ?? ""}`}
      style={props.style}
    >
      <header className="border-b px-3 py-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Secondary Panel</h2>
        <Button variant="ghost" size="icon-xs" onClick={props.onClose} title="Close panel">
          <XIcon className="size-3.5" />
        </Button>
      </header>

      <Tabs
        value={props.tab}
        onValueChange={(value) => props.onTabChange(value as RightSidebarTab)}
        className="flex-1 min-h-0"
      >
        <TabsList className="mx-3 mt-2 w-auto">
          <TabsTrigger value="curriculum">
            <BookOpenIcon className="size-3.5 mr-1.5" />
            Curriculum
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SettingsIcon className="size-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="curriculum" className="mt-2 px-3 pb-3 min-h-0 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">curriculum.md</p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setCurriculumEditing((value) => !value)}>
                {curriculumEditing ? "Preview" : "Edit"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onReloadCurriculum()}>
                Refresh
              </Button>
              {curriculumEditing ? (
                <Button size="sm" onClick={() => void onSaveCurriculum()} disabled={curriculumSaving}>
                  {curriculumSaving ? "Saving..." : "Save"}
                </Button>
              ) : null}
            </div>
          </div>

          {curriculumLoading ? (
            <div className="text-sm text-muted-foreground">Loading curriculum...</div>
          ) : curriculumEditing ? (
            <Textarea
              value={curriculumDraft}
              onChange={(event) => setCurriculumDraft(event.target.value)}
              className="flex-1 min-h-[280px] font-mono text-xs"
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/70 bg-background/40 p-3">
              {curriculumMarkdown.trim().length > 0 ? (
                <Markdown text={curriculumMarkdown} />
              ) : (
                <p className="text-sm text-muted-foreground">No curriculum found for this notebook yet.</p>
              )}
            </div>
          )}

          {curriculumError ? (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {curriculumError}
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="settings" className="mt-2 px-3 pb-3 min-h-0 flex flex-col">
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Default agent</label>
                <NativeSelect
                  className="w-full"
                  value={selectedAgent}
                  onChange={(event) => setSelectedAgent(event.target.value)}
                >
                  <NativeSelectOption value="">Auto</NativeSelectOption>
                  {agentCatalog.map((agent) => (
                    <NativeSelectOption key={agent.name} value={agent.name}>
                      {agent.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Provider</label>
                <NativeSelect
                  className="w-full"
                  value={selectedProvider}
                  onChange={(event) => onProviderChange(event.target.value)}
                >
                  {providerCatalog.providers.map((provider) => (
                    <NativeSelectOption key={provider.id} value={provider.id}>
                      {provider.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Model</label>
                <NativeSelect
                  className="w-full"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                >
                  {providerModels.map((model) => (
                    <NativeSelectOption key={`${selectedProvider}:${model.id}`} value={model.id}>
                      {model.name ?? model.id}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Log level</label>
                <NativeSelect
                  className="w-full"
                  value={selectedLogLevel}
                  onChange={(event) => setSelectedLogLevel(event.target.value as LogLevel | "")}
                >
                  <NativeSelectOption value="">Default</NativeSelectOption>
                  <NativeSelectOption value="debug">debug</NativeSelectOption>
                  <NativeSelectOption value="info">info</NativeSelectOption>
                  <NativeSelectOption value="warn">warn</NativeSelectOption>
                  <NativeSelectOption value="error">error</NativeSelectOption>
                </NativeSelect>
              </div>

              <Button className="w-full" onClick={() => void onSaveSettings()} disabled={settingsSaving}>
                {settingsSaving ? "Saving..." : "Save settings"}
              </Button>
            </div>
          )}

          {settingsError ? (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {settingsError}
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </aside>
  )
}
