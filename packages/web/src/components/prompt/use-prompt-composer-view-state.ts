import { useEffect, useMemo, useRef, useState } from "react"
import { RESOURCE_LOCAL_SLASH_COMMANDS } from "../../lib/resource-commands"
import {
  filterMentionOptions,
  getMentionMatch,
  type MentionOption,
  type MentionableAgent,
  type MentionableFile,
} from "./mention-autocomplete"
import { promptPlaceholder } from "./placeholder"
import {
  filterSlashCommands,
  getSlashMatch,
  type SlashCommandOption,
  type SlashCommandSource,
} from "./slash-autocomplete"

const MAX_RECENT_MENTION_FILES = 8

const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  {
    type: "builtin",
    name: "new",
    title: "Start new thread",
    description: "Create a fresh session in this notebook.",
  },
  {
    type: "builtin",
    name: "persona",
    title: "Cycle persona",
    description: "Switch to the next available Buddy persona.",
  },
  {
    type: "builtin",
    name: "model",
    title: "Choose model",
    description: "Open the model picker.",
  },
  {
    type: "builtin",
    name: "mcp",
    title: "Open MCPs",
    description: "Open MCP controls.",
  },
]

const PLACEHOLDER_KEYS: Record<string, string> = {
  "prompt.placeholder.shell": "Run a shell command",
  "prompt.placeholder.summarizeComments": "Summarize these comments",
  "prompt.placeholder.summarizeComment": "Summarize this comment",
}

function translatePromptPlaceholder(key: string, params?: Record<string, string>) {
  if (key === "prompt.placeholder.normal") {
    if (params?.example) return `Try: ${params.example}`
    return "Ask Buddy"
  }
  return PLACEHOLDER_KEYS[key] ?? "Ask Buddy"
}

function dedupeMentionFiles(files: MentionableFile[]) {
  const seen = new Set<string>()
  return files.filter((file) => {
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })
}

type UsePromptComposerViewStateProps = {
  cursorOffset: number
  draftValue: string
  selectedIntent: "auto" | "learn" | "practice" | "assess"
  selectedPersona: string
  personaOptions: Array<{
    name: string
    label?: string
  }>
  mentionableAgents: MentionableAgent[]
  slashCommands: Array<{
    name: string
    description?: string
    source?: SlashCommandSource
  }>
  modelOptions: Array<{
    key: string
    label: string
    group?: string
    disabled?: boolean
  }>
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
}

export function usePromptComposerViewState(props: UsePromptComposerViewStateProps) {
  const [mentionIndex, setMentionIndex] = useState(0)
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | undefined>(undefined)
  const [slashIndex, setSlashIndex] = useState(0)
  const [dismissedSlashKey, setDismissedSlashKey] = useState<string | undefined>(undefined)
  const [searchMentionFiles, setSearchMentionFiles] = useState<MentionableFile[]>([])
  const [searchingFiles, setSearchingFiles] = useState(false)
  const [recentMentionFiles, setRecentMentionFiles] = useState<MentionableFile[]>([])
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState("Ask Buddy...")
  const [placeholderOpacity, setPlaceholderOpacity] = useState(1)
  // useRef: changing this doesn't need a re-render — it's only read inside useEffect.
  const slashRefreshRequestedRef = useRef(false)

  const knownAgents = useMemo(
    () => new Set(props.mentionableAgents.map((agent) => agent.name)),
    [props.mentionableAgents],
  )
  const personaOptions = useMemo(() => {
    if (props.personaOptions.length > 0) return props.personaOptions
    return props.selectedPersona ? [{ name: props.selectedPersona }] : [{ name: "buddy" }]
  }, [props.personaOptions, props.selectedPersona])
  const slashCommandOptions = useMemo<SlashCommandOption[]>(() => {
    const customCommands = props.slashCommands.map((command) => ({
      type: "custom" as const,
      name: command.name,
      title: command.name,
      description: command.description,
      source: command.source,
    }))
    const localNames = new Set(RESOURCE_LOCAL_SLASH_COMMANDS.map((command) => command.name.toLowerCase()))
    const filteredCustomCommands = customCommands.filter((command) => !localNames.has(command.name.toLowerCase()))
    const customNames = new Set(filteredCustomCommands.map((command) => command.name.toLowerCase()))

    return [
      ...filteredCustomCommands,
      ...BUILTIN_SLASH_COMMANDS.filter((command) => !customNames.has(command.name.toLowerCase())),
      ...RESOURCE_LOCAL_SLASH_COMMANDS,
    ]
  }, [props.slashCommands])

  const mentionMatch = useMemo(
    () => getMentionMatch(props.draftValue, props.cursorOffset),
    [props.cursorOffset, props.draftValue],
  )
  const mentionKey = mentionMatch ? `${mentionMatch.start}:${mentionMatch.query}` : undefined
  const mentionFiles = useMemo(
    () => dedupeMentionFiles([...recentMentionFiles, ...searchMentionFiles]),
    [recentMentionFiles, searchMentionFiles],
  )
  const mentionOptions = useMemo<MentionOption[]>(() => {
    if (!mentionMatch) return []
    return filterMentionOptions(props.mentionableAgents, mentionFiles, mentionMatch.query).slice(0, 10)
  }, [mentionFiles, mentionMatch, props.mentionableAgents])
  const mentionVisible = !!mentionMatch && mentionOptions.length > 0 && mentionKey !== dismissedMentionKey
  const showMentionLoading = !!mentionMatch && mentionKey !== dismissedMentionKey && searchingFiles

  const slashMatch = useMemo(
    () => getSlashMatch(props.draftValue, props.cursorOffset),
    [props.cursorOffset, props.draftValue],
  )
  const slashKey = slashMatch ? `${slashMatch.start}:${slashMatch.query}` : undefined
  const slashOptions = useMemo(() => {
    if (!slashMatch) return []
    return filterSlashCommands(slashCommandOptions, slashMatch.query)
  }, [slashCommandOptions, slashMatch])
  const slashVisible = !!slashMatch && slashOptions.length > 0 && slashKey !== dismissedSlashKey

  const groupedModelOptions = useMemo(() => {
    const grouped = new Map<string, Array<(typeof props.modelOptions)[number]>>()
    const ungrouped: Array<(typeof props.modelOptions)[number]> = []

    for (const option of props.modelOptions) {
      if (!option.group) {
        ungrouped.push(option)
        continue
      }

      const existing = grouped.get(option.group)
      if (existing) {
        existing.push(option)
        continue
      }
      grouped.set(option.group, [option])
    }

    return {
      ungrouped,
      grouped: Array.from(grouped.entries()),
    }
  }, [props.modelOptions])

  const placeholder = useMemo(
    () =>
      promptPlaceholder({
        mode: "normal",
        commentCount: 0,
        example: "",
        suggest: false,
        intent: props.selectedIntent,
        t: translatePromptPlaceholder,
      }),
    [props.selectedIntent],
  )

  useEffect(() => {
    if (displayedPlaceholder === placeholder) return
    setPlaceholderOpacity(0)
    const timeout = setTimeout(() => {
      setDisplayedPlaceholder(placeholder)
      setPlaceholderOpacity(1)
    }, 250)
    return () => clearTimeout(timeout)
  }, [placeholder, displayedPlaceholder])

  useEffect(() => {
    setMentionIndex(0)
  }, [mentionKey])

  useEffect(() => {
    setSlashIndex(0)
  }, [slashKey])

  useEffect(() => {
    if (!mentionKey) {
      setDismissedMentionKey(undefined)
      return
    }

    if (dismissedMentionKey && dismissedMentionKey !== mentionKey) {
      setDismissedMentionKey(undefined)
    }
  }, [dismissedMentionKey, mentionKey])

  useEffect(() => {
    if (!slashKey) {
      setDismissedSlashKey(undefined)
      return
    }

    if (dismissedSlashKey && dismissedSlashKey !== slashKey) {
      setDismissedSlashKey(undefined)
    }
  }, [dismissedSlashKey, slashKey])

  useEffect(() => {
    if (!slashMatch) {
      slashRefreshRequestedRef.current = false
      return
    }

    if (slashRefreshRequestedRef.current) return
    slashRefreshRequestedRef.current = true
    props.onRefreshSlashCommands?.()
  }, [props.onRefreshSlashCommands, slashMatch])

  useEffect(() => {
    if (!mentionMatch || !props.onSearchFiles) {
      setSearchMentionFiles([])
      setSearchingFiles(false)
      return
    }

    const query = mentionMatch.query.trim()
    if (!query) {
      setSearchMentionFiles([])
      setSearchingFiles(false)
      return
    }

    let cancelled = false
    setSearchingFiles(true)
    props
      .onSearchFiles(query)
      .then((files) => {
        if (cancelled) return
        setSearchMentionFiles(files)
        setSearchingFiles(false)
      })
      .catch(() => {
        if (cancelled) return
        setSearchMentionFiles([])
        setSearchingFiles(false)
      })

    return () => {
      cancelled = true
    }
  }, [mentionKey, mentionMatch, props.onSearchFiles])

  function appendRecentMentionFile(file: MentionableFile) {
    setRecentMentionFiles((current) =>
      dedupeMentionFiles([{ ...file, recent: true }, ...current]).slice(0, MAX_RECENT_MENTION_FILES),
    )
  }

  return {
    knownAgents,
    personaOptions,
    groupedModelOptions,
    mentionMatch,
    mentionKey,
    mentionOptions,
    mentionVisible,
    mentionIndex,
    setMentionIndex,
    dismissedMentionKey,
    setDismissedMentionKey,
    showMentionLoading,
    slashMatch,
    slashKey,
    slashOptions,
    slashVisible,
    slashIndex,
    setSlashIndex,
    dismissedSlashKey,
    setDismissedSlashKey,
    appendRecentMentionFile,
    displayedPlaceholder,
    placeholderOpacity,
  }
}
