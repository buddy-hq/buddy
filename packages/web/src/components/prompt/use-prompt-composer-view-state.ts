import { useEffect, useMemo, useRef, useState } from "react"
import { language } from "@/context/language"
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
  COMPACT_SLASH_COMMAND_ALIASES,
  COMPACT_SLASH_COMMAND_NAME,
  filterSlashCommands,
  FORK_SLASH_COMMAND_ALIASES,
  FORK_SLASH_COMMAND_NAME,
  getSlashMatch,
  QUIZ_SLASH_COMMAND_NAME,
  REDO_SLASH_COMMAND_NAME,
  UNDO_SLASH_COMMAND_NAME,
  type SlashCommandOption,
  type SlashCommandSource,
} from "./slash-autocomplete"

const MAX_RECENT_MENTION_FILES = 8

const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  {
    type: "builtin",
    name: "new",
    title: language.t("prompt.slash.new.title"),
    description: language.t("prompt.slash.new.description"),
  },
  {
    type: "builtin",
    name: "persona",
    title: language.t("prompt.slash.persona.title"),
    description: language.t("prompt.slash.persona.description"),
  },
  {
    type: "builtin",
    name: "model",
    title: language.t("prompt.slash.model.title"),
    description: language.t("prompt.slash.model.description"),
  },
  {
    type: "builtin",
    name: "mcp",
    title: language.t("prompt.slash.mcp.title"),
    description: language.t("prompt.slash.mcp.description"),
  },
  {
    type: "builtin",
    name: COMPACT_SLASH_COMMAND_NAME,
    aliases: [...COMPACT_SLASH_COMMAND_ALIASES],
    title: language.t("prompt.slash.compact.title"),
    description: language.t("prompt.slash.compact.description"),
  },
  {
    type: "builtin",
    name: UNDO_SLASH_COMMAND_NAME,
    title: language.t("prompt.slash.undo.title"),
    description: language.t("prompt.slash.undo.description"),
  },
  {
    type: "builtin",
    name: REDO_SLASH_COMMAND_NAME,
    title: language.t("prompt.slash.redo.title"),
    description: language.t("prompt.slash.redo.description"),
  },
  {
    type: "builtin",
    name: FORK_SLASH_COMMAND_NAME,
    aliases: [...FORK_SLASH_COMMAND_ALIASES],
    title: language.t("prompt.slash.fork.title"),
    description: language.t("prompt.slash.fork.description"),
  },
  {
    type: "builtin",
    name: QUIZ_SLASH_COMMAND_NAME,
    title: language.t("prompt.slash.quiz.title"),
    description: language.t("prompt.slash.quiz.description"),
  },
  {
    type: "builtin",
    name: "play",
    title: language.t("prompt.slash.play.title"),
    description: language.t("prompt.slash.play.description"),
  },
]

function translatePromptPlaceholder(key: string, params?: Record<string, string>) {
  if (key === "prompt.placeholder.normal") {
    if (params?.example) return language.t(key, params)
    return language.t("prompt.placeholder.simple")
  }
  return language.t(key)
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
    acceptsImages: boolean
  }>
  onSearchFiles?: (query: string) => Promise<MentionableFile[]>
  onRefreshSlashCommands?: () => void
}

export function usePromptComposerViewState(props: UsePromptComposerViewStateProps) {
  const { onRefreshSlashCommands, onSearchFiles } = props
  const [mentionIndex, setMentionIndex] = useState(0)
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | undefined>(undefined)
  const [slashIndex, setSlashIndex] = useState(0)
  const [dismissedSlashKey, setDismissedSlashKey] = useState<string | undefined>(undefined)
  const [searchMentionFiles, setSearchMentionFiles] = useState<MentionableFile[]>([])
  const [searchingFiles, setSearchingFiles] = useState(false)
  const [recentMentionFiles, setRecentMentionFiles] = useState<MentionableFile[]>([])
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState(
    language.t("prompt.placeholder.initial"),
  )
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
    const localNames = new Set([
      ...RESOURCE_LOCAL_SLASH_COMMANDS.map((command) => command.name.toLowerCase()),
      COMPACT_SLASH_COMMAND_NAME.toLowerCase(),
    ])
    const filteredCustomCommands = customCommands.filter(
      (command) => !localNames.has(command.name.toLowerCase()),
    )
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
    return filterMentionOptions(props.mentionableAgents, mentionFiles, mentionMatch.query).slice(
      0,
      10,
    )
  }, [mentionFiles, mentionMatch, props.mentionableAgents])
  const mentionVisible =
    !!mentionMatch && mentionOptions.length > 0 && mentionKey !== dismissedMentionKey
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
        t: translatePromptPlaceholder,
      }),
    [],
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
    onRefreshSlashCommands?.()
  }, [onRefreshSlashCommands, slashMatch])

  useEffect(() => {
    if (!mentionMatch || !onSearchFiles) {
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
    onSearchFiles(query)
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
  }, [mentionKey, mentionMatch, onSearchFiles])

  function appendRecentMentionFile(file: MentionableFile) {
    setRecentMentionFiles((current) =>
      dedupeMentionFiles([{ ...file, recent: true }, ...current]).slice(
        0,
        MAX_RECENT_MENTION_FILES,
      ),
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
