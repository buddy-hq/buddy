import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Command, CommandItem, CommandList, cn } from "@buddy/ui"
import {
  Bot,
  CpuSettingsIcon,
  FolderOpen,
  Gamepad2Icon,
  GitBranch,
  GraduationCapIcon,
  LoaderCircleIcon,
  PlugIcon,
  Redo2Icon,
  RubiksCube,
  SearchIcon,
  Sigma,
  SquarePen,
  Terminal,
  Undo2Icon,
  type AppIcon,
} from "@/icons/app-icons"
import { FileTypeIcon } from "../../files/file-type-icon"
import { language } from "@/context/language"
import { basename, dirname } from "../../chat/utils/path"
import type { MentionOption } from "../mention-autocomplete"
import {
  COMPACT_SLASH_COMMAND_NAME,
  FORK_SLASH_COMMAND_NAME,
  QUIZ_SLASH_COMMAND_NAME,
  REDO_SLASH_COMMAND_NAME,
  UNDO_SLASH_COMMAND_NAME,
  type SlashCommandOption,
} from "../slash-autocomplete"

type PromptAutocompleteMenuProps = {
  slashVisible: boolean
  mentionVisible: boolean
  showMentionLoading: boolean
  mentionQuery?: string
  slashOptions: SlashCommandOption[]
  slashIndex: number
  mentionOptions: MentionOption[]
  mentionIndex: number
  onApplySlash: (command: SlashCommandOption) => void
  onApplyMention: (option: MentionOption) => void
  onSetSlashIndex: (index: number) => void
  onSetMentionIndex: (index: number) => void
}

const ROW_CLASS =
  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none data-selected:bg-transparent"
const ROW_ACTIVE_CLASS = "bg-surface-raised-base-hover"
const ICON_CLASS = "size-3.5 shrink-0 text-text-weaker"
const ICON_ACTIVE_CLASS = "text-text-weak"
const PRIMARY_CLASS = "min-w-0 flex-1 truncate text-[13px] font-medium text-text-weak"
const PRIMARY_ACTIVE_CLASS = "text-text-base"
const DESCRIPTION_CLASS = "max-w-[52%] shrink-0 truncate text-right text-[11px] text-text-weaker"
const BADGE_CLASS = "shrink-0 text-[10px] font-medium uppercase tracking-wide text-text-weakest"
const HEADER_CLASS =
  "px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-text-weakest"
const STATUS_ROW_CLASS = "flex items-center gap-2 px-2.5 py-2 text-xs text-text-weaker"
const MENTION_ICON_SIZE = "size-3.5 shrink-0"

const SLASH_BUILTIN_ICONS: Record<string, AppIcon> = {
  new: SquarePen,
  model: CpuSettingsIcon,
  mcp: PlugIcon,
  play: Gamepad2Icon,
  [COMPACT_SLASH_COMMAND_NAME]: Sigma,
  [FORK_SLASH_COMMAND_NAME]: GitBranch,
  [QUIZ_SLASH_COMMAND_NAME]: GraduationCapIcon,
  [UNDO_SLASH_COMMAND_NAME]: Undo2Icon,
  [REDO_SLASH_COMMAND_NAME]: Redo2Icon,
}

function slashCommandIcon(command: SlashCommandOption): AppIcon {
  if (command.source === "skill") return RubiksCube
  if (command.source === "mcp") return PlugIcon
  if (command.type === "builtin") return SLASH_BUILTIN_ICONS[command.name] ?? Terminal
  return Terminal
}

function slashCommandBadge(command: SlashCommandOption): string | undefined {
  if (command.source === "skill") return language.t("prompt.autocomplete.badge.skill")
  if (command.source === "mcp") return language.t("prompt.autocomplete.badge.mcp")
  if (command.type === "custom") return language.t("prompt.autocomplete.badge.command")
  return undefined
}

function slashGroupKey(command: SlashCommandOption): string {
  return command.source === "skill" ? "skill" : "command"
}

function slashGroupHeader(command: SlashCommandOption): string | null {
  return command.source === "skill" ? language.t("prompt.autocomplete.group.skills") : null
}

function mentionGroupKey(option: MentionOption): string {
  if (option.type === "reference") return "reference"
  if (option.type === "agent") return "agent"
  return option.recent ? "recent" : "file"
}

function mentionGroupHeader(option: MentionOption): string {
  if (option.type === "reference") return language.t("prompt.autocomplete.group.references")
  if (option.type === "agent") return language.t("prompt.autocomplete.group.agents")
  return option.recent
    ? language.t("prompt.autocomplete.group.recent")
    : language.t("prompt.autocomplete.group.files")
}

function getMentionOptionKey(option: MentionOption): string {
  if (option.type === "agent") return `agent:${option.name}`
  if (option.type === "reference") return `reference:${option.name}`
  return `file:${option.path}`
}

function getMentionFileDescription(path: string): string | undefined {
  const parentPath = dirname(path)
  return parentPath === "/" ? undefined : parentPath
}

type MenuRow<T> =
  | { kind: "header"; key: string; label: string }
  | { kind: "item"; key: string; item: T; index: number }

function buildRows<T>(
  items: T[],
  groupKey: (item: T) => string,
  groupHeader: (item: T) => string | null,
  itemKey: (item: T, index: number) => string,
): MenuRow<T>[] {
  const rows: MenuRow<T>[] = []
  let previousGroup: string | null = null
  items.forEach((item, index) => {
    const key = groupKey(item)
    if (key !== previousGroup) {
      const header = groupHeader(item)
      if (header) rows.push({ kind: "header", key: `header:${key}`, label: header })
    }
    previousGroup = key
    rows.push({ kind: "item", key: itemKey(item, index), item, index })
  })
  return rows
}

function MenuHeader({ label }: { label: string }) {
  return <div className={HEADER_CLASS}>{label}</div>
}

export function PromptAutocompleteMenu(props: PromptAutocompleteMenuProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const open = props.slashVisible || props.mentionVisible

  const slashActive = props.slashOptions[props.slashIndex]
  const mentionActive = props.mentionOptions[props.mentionIndex]
  const activeValue = props.slashVisible
    ? slashActive?.name.toLowerCase()
    : mentionActive
      ? getMentionOptionKey(mentionActive).toLowerCase()
      : undefined

  React.useLayoutEffect(() => {
    if (!open || !activeValue || !listRef.current) return
    const el = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-value]")).find(
      (element) => element.dataset.value === activeValue,
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [activeValue, open])

  const slashRows = React.useMemo(
    () =>
      buildRows<SlashCommandOption>(
        props.slashOptions,
        slashGroupKey,
        slashGroupHeader,
        (command) => `${command.type}:${command.name}`,
      ),
    [props.slashOptions],
  )
  const mentionRows = React.useMemo(
    () => buildRows<MentionOption>(props.mentionOptions, mentionGroupKey, mentionGroupHeader, getMentionOptionKey),
    [props.mentionOptions],
  )

  const hasMentionOptions = props.mentionOptions.length > 0
  const mentionQueryEmpty = (props.mentionQuery ?? "").trim().length === 0

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="prompt-autocomplete-menu"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.985 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-x-2 bottom-full z-20 mb-2 origin-bottom"
        >
          <Command
            data-component="prompt-autocomplete-menu"
            shouldFilter={false}
            className="composer-surface-menu composer-grain h-auto max-h-80 w-full overflow-hidden"
          >
            <CommandList ref={listRef} className="composer-scroll max-h-80 p-1.5">
              {props.slashVisible ? (
                props.slashOptions.length === 0 ? (
                  <div className={STATUS_ROW_CLASS}>
                    <Terminal className="size-3.5 shrink-0 text-text-weakest" />
                    {language.t("prompt.autocomplete.noCommands")}
                  </div>
                ) : (
                  slashRows.map((row) => {
                    if (row.kind === "header") return <MenuHeader key={row.key} label={row.label} />
                    const command = row.item
                    const active = row.index === props.slashIndex
                    const Icon = slashCommandIcon(command)
                    const badge = slashCommandBadge(command)
                    const description = command.description ?? command.title
                    return (
                      <CommandItem
                        key={row.key}
                        value={command.name.toLowerCase()}
                        data-value={command.name.toLowerCase()}
                        data-component="prompt-slash-option"
                        className={cn(ROW_CLASS, active && ROW_ACTIVE_CLASS)}
                        onMouseMove={() => {
                          if (!active) props.onSetSlashIndex(row.index)
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        onSelect={() => props.onApplySlash(command)}
                      >
                        <Icon className={cn(ICON_CLASS, active && ICON_ACTIVE_CLASS)} />
                        <span className={cn(PRIMARY_CLASS, active && PRIMARY_ACTIVE_CLASS)}>
                          {command.title ?? `/${command.name}`}
                        </span>
                        {description ? <span className={DESCRIPTION_CLASS}>{description}</span> : null}
                        {badge ? <span className={BADGE_CLASS}>{badge}</span> : null}
                      </CommandItem>
                    )
                  })
                )
              ) : (
                <>
                  {mentionRows.map((row) => {
                    if (row.kind === "header") return <MenuHeader key={row.key} label={row.label} />
                    const option = row.item
                    const active = row.index === props.mentionIndex
                    const isDirectory = option.type === "file" && option.path.endsWith("/")
                    const fileName =
                      option.type === "file"
                        ? (basename(option.path.replace(/\/+$/, "")) || option.path)
                        : undefined
                    const description =
                      option.type === "file"
                        ? (getMentionFileDescription(option.path) ??
                          (option.recent ? language.t("prompt.autocomplete.recentFile") : undefined))
                        : option.description
                    const primary =
                      option.type === "file" ? (fileName ?? option.path) : `@${option.name}`
                    return (
                      <CommandItem
                        key={row.key}
                        value={getMentionOptionKey(option).toLowerCase()}
                        data-value={getMentionOptionKey(option).toLowerCase()}
                        data-component="prompt-mention-option"
                        className={cn(ROW_CLASS, active && ROW_ACTIVE_CLASS)}
                        onMouseMove={() => {
                          if (!active) props.onSetMentionIndex(row.index)
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        onSelect={() => props.onApplyMention(option)}
                      >
                        {option.type === "agent" ? (
                          <Bot className={cn(ICON_CLASS, active && ICON_ACTIVE_CLASS)} />
                        ) : option.type === "reference" || isDirectory ? (
                          <FolderOpen className={cn(ICON_CLASS, active && ICON_ACTIVE_CLASS)} />
                        ) : (
                          <FileTypeIcon fileName={option.path} className={MENTION_ICON_SIZE} />
                        )}
                        <span className={cn(PRIMARY_CLASS, active && PRIMARY_ACTIVE_CLASS)}>
                          {primary}
                        </span>
                        {description ? <span className={DESCRIPTION_CLASS}>{description}</span> : null}
                      </CommandItem>
                    )
                  })}

                  {props.showMentionLoading ? (
                    <div className={STATUS_ROW_CLASS}>
                      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-text-weakest" />
                      {language.t("prompt.autocomplete.searchingFiles")}
                    </div>
                  ) : !hasMentionOptions ? (
                    <div className={STATUS_ROW_CLASS}>
                      <SearchIcon className="size-3.5 shrink-0 text-text-weakest" />
                      {mentionQueryEmpty
                        ? language.t("prompt.autocomplete.searchFilesHint")
                        : language.t("prompt.autocomplete.noMatches")}
                    </div>
                  ) : null}
                </>
              )}
            </CommandList>
          </Command>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
