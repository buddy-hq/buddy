import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { language } from "@/context/language"
import type { NotebookSearchResult } from "@/state/notebook-search"
import { RESOURCE_LOCAL_SLASH_COMMANDS } from "../../lib/resource-commands"
import type { SkillPresentationLookup } from "../skills/skill-presentation"
import {
  filterMentionOptions,
  getMentionMatch,
  isFolderPrefixMention,
  mentionOptionIdentity,
  type MentionOption,
  type MentionableAgent,
  type MentionableFile,
  type MentionableReference,
} from "./mention-autocomplete"
import { promptPlaceholder } from "./placeholder"
import {
  COMPACT_SLASH_COMMAND_ALIASES,
  COMPACT_SLASH_COMMAND_NAME,
  filterSlashCommands,
  FORK_SLASH_COMMAND_ALIASES,
  FORK_SLASH_COMMAND_NAME,
  getSlashMatch,
  isHiddenSlashCommandName,
  NOTE_SLASH_COMMAND_NAME,
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

// Listed only while the composer can actually save notes, and only from chat
// mode — once Note mode is on there is nothing left for the command to do.
const NOTE_SLASH_COMMAND: SlashCommandOption = {
  type: "builtin",
  name: NOTE_SLASH_COMMAND_NAME,
  title: language.t("prompt.slash.note.title"),
  description: language.t("prompt.slash.note.description"),
}

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

function notebookMentionDirectories(results: readonly NotebookSearchResult[]): MentionableFile[] {
  const paths = new Set<string>()
  for (const result of results) {
    const target = result.target.type === "open-tab" ? result.target.target : result.target
    const filePath =
      target.type === "file"
        ? target.path
        : target.type === "workspace-file" && target.root === "notebook"
          ? target.path
          : target.type === "resource"
            ? target.path
            : undefined
    if (!filePath) continue
    let slash = filePath.lastIndexOf("/")
    while (slash > 0) {
      paths.add(`${filePath.slice(0, slash)}/`)
      slash = filePath.lastIndexOf("/", slash - 1)
    }
  }
  return [...paths].map((path) => ({ path }))
}

type UsePromptComposerViewStateProps = {
  cursorOffset: number
  draftValue: string
  mentionableAgents: MentionableAgent[]
  mentionableReferences: MentionableReference[]
  notebookResults: readonly NotebookSearchResult[]
  notebookSearching: boolean
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
  skillPresentation: SkillPresentationLookup
  noteCommandAvailable: boolean
  onRefreshSlashCommands?: () => void
}

export function usePromptComposerViewState(props: UsePromptComposerViewStateProps) {
  const { onRefreshSlashCommands, skillPresentation } = props
  // The highlight follows a row, not a position: undefined tracks the top result as it
  // changes, and a row the user moved to stays highlighted when late results arrive.
  const [selectedMentionIdentity, setSelectedMentionIdentity] = useState<string | undefined>(
    undefined,
  )
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | undefined>(undefined)
  const [slashIndex, setSlashIndex] = useState(0)
  const [dismissedSlashKey, setDismissedSlashKey] = useState<string | undefined>(undefined)
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
  const slashCommandOptions = useMemo<SlashCommandOption[]>(() => {
    const customCommands = props.slashCommands
      .filter((command) => !isHiddenSlashCommandName(command.name))
      .map((command) => ({
        type: "custom" as const,
        name: command.name,
        // A skill command is titled by the skill, so the menu says "Analogies"
        // where the sidebar does — and typing that still finds the row, because
        // the title is what `filterSlashCommands` searches.
        title:
          (command.source === "skill" ? skillPresentation(command.name)?.displayName : undefined) ??
          command.name,
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

    const builtinCommands = props.noteCommandAvailable
      ? [...BUILTIN_SLASH_COMMANDS, NOTE_SLASH_COMMAND]
      : BUILTIN_SLASH_COMMANDS

    return [
      ...filteredCustomCommands,
      ...builtinCommands.filter((command) => !customNames.has(command.name.toLowerCase())),
      ...RESOURCE_LOCAL_SLASH_COMMANDS,
    ]
  }, [props.noteCommandAvailable, props.slashCommands, skillPresentation])

  const mentionMatch = useMemo(
    () => getMentionMatch(props.draftValue, props.cursorOffset),
    [props.cursorOffset, props.draftValue],
  )
  const mentionKey = mentionMatch ? `${mentionMatch.start}:${mentionMatch.query}` : undefined
  const mentionFiles = useMemo(
    () =>
      dedupeMentionFiles([
        ...recentMentionFiles,
        ...notebookMentionDirectories(props.notebookResults),
      ]),
    [recentMentionFiles, props.notebookResults],
  )
  const mentionOptions = useMemo<MentionOption[]>(() => {
    if (!mentionMatch) return []
    const existing = filterMentionOptions(
      props.mentionableReferences,
      props.mentionableAgents,
      mentionFiles,
      mentionMatch.query,
    )
    const notebook = props.notebookResults.map(
      (result): MentionOption => ({ type: "notebook", result }),
    )
    const notebookPaths = new Set(
      notebook.flatMap((option) =>
        option.type === "notebook" && option.result.target.type === "file"
          ? [option.result.target.path]
          : [],
      ),
    )
    const prefixFolders = existing.filter((option) =>
      isFolderPrefixMention(option, mentionMatch.query),
    )
    return [
      ...existing.filter((option) => option.type !== "file"),
      ...prefixFolders,
      ...notebook,
      ...existing.filter(
        (option) =>
          option.type === "file" &&
          !prefixFolders.includes(option) &&
          !notebookPaths.has(option.path),
      ),
    ].slice(0, 10)
  }, [
    mentionFiles,
    mentionMatch,
    props.mentionableAgents,
    props.mentionableReferences,
    props.notebookResults,
  ])
  const mentionIndex = useMemo(() => {
    if (selectedMentionIdentity === undefined) return 0
    const index = mentionOptions.findIndex(
      (option) => mentionOptionIdentity(option) === selectedMentionIdentity,
    )
    return index < 0 ? 0 : index
  }, [mentionOptions, selectedMentionIdentity])
  const mentionOptionsRef = useRef(mentionOptions)
  mentionOptionsRef.current = mentionOptions
  const setMentionIndex = useCallback((index: number) => {
    const option = mentionOptionsRef.current[index]
    setSelectedMentionIdentity(option ? mentionOptionIdentity(option) : undefined)
  }, [])
  const mentionVisible =
    !!mentionMatch && mentionOptions.length > 0 && mentionKey !== dismissedMentionKey
  const showMentionLoading =
    !!mentionMatch && mentionKey !== dismissedMentionKey && props.notebookSearching

  // `@` wins over `/` when both could match (mirrors opencode's
  // `if (atMatch) … else if (slashMatch)`): typing "@" after an abandoned
  // "/quer" switches straight to the mention menu.
  const slashMatch = useMemo(() => {
    if (mentionMatch) return undefined
    return getSlashMatch(props.draftValue, props.cursorOffset)
  }, [mentionMatch, props.cursorOffset, props.draftValue])
  const slashKey = slashMatch ? `${slashMatch.start}:${slashMatch.query}` : undefined
  const slashOptions = useMemo(() => {
    if (!slashMatch) return []
    const filtered = filterSlashCommands(slashCommandOptions, slashMatch.query)
    // Commands (built-ins, MCP, custom commands) first, then Skills — the menu
    // renders a "Skills" header at that boundary. Order within each group keeps
    // the relevance sort from `filterSlashCommands`.
    const commands = filtered.filter((command) => command.source !== "skill")
    const skills = filtered.filter((command) => command.source === "skill")
    return [...commands, ...skills]
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
    setSelectedMentionIdentity(undefined)
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
