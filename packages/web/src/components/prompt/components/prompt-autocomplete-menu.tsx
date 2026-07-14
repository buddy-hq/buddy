import * as React from "react"
import { BotIcon, Command, CommandItem, CommandList, FolderOpenIcon, cn } from "@buddy/ui"
import { FileTextIcon } from "lucide-react"
import { language } from "@/context/language"
import { basename, dirname } from "../../chat/utils/path"
import type { MentionOption } from "../mention-autocomplete"
import type { SlashCommandOption } from "../slash-autocomplete"

type PromptAutocompleteMenuProps = {
  slashVisible: boolean
  mentionVisible: boolean
  showMentionLoading: boolean
  slashOptions: SlashCommandOption[]
  slashIndex: number
  mentionOptions: MentionOption[]
  mentionIndex: number
  onApplySlash: (command: SlashCommandOption) => void
  onApplyMention: (option: MentionOption) => void
  onSetSlashIndex: (index: number) => void
  onSetMentionIndex: (index: number) => void
}

type MentionFilePathParts = {
  isDirectory: boolean
  label: string
}

function getMentionFilePathParts(path: string): MentionFilePathParts {
  return {
    isDirectory: path.endsWith("/"),
    label: basename(path),
  }
}

function getMentionFileDescription(path: string): string | undefined {
  const parentPath = dirname(path)
  return parentPath === "/" ? undefined : parentPath
}

function getMentionOptionKey(option: MentionOption): string {
  if (option.type === "agent") return `agent:${option.name}`
  if (option.type === "reference") return `reference:${option.name}`
  return `file:${option.path}`
}

export function PromptAutocompleteMenu(props: PromptAutocompleteMenuProps) {
  const listRef = React.useRef<HTMLDivElement>(null)

  const slashActive = props.slashOptions[props.slashIndex]
  const mentionActive = props.mentionOptions[props.mentionIndex]
  const activeValue = props.slashVisible
    ? slashActive?.name
    : mentionActive
      ? mentionActive.type === "agent"
        ? `agent:${mentionActive.name}`
        : mentionActive.type === "reference"
          ? `reference:${mentionActive.name}`
          : `file:${mentionActive.path}`
      : undefined

  React.useLayoutEffect(() => {
    if (!activeValue || !listRef.current) return
    const el = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-value]")).find(
      (element) => element.dataset.value === activeValue.toLowerCase(),
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [activeValue])

  if (!props.slashVisible && !props.mentionVisible && !props.showMentionLoading) {
    return null
  }

  return (
    <Command
      data-component="prompt-autocomplete-menu"
      shouldFilter={false}
      className="absolute inset-x-2 bottom-full z-20 mb-2 h-auto max-h-80 w-auto rounded-xl border bg-surface-raised-stronger-non-alpha/95 shadow-lg backdrop-blur"
    >
      <CommandList ref={listRef} className="max-h-80">
        {props.slashVisible ? (
          props.slashOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-weak">
              {language.t("prompt.autocomplete.noCommands")}
            </div>
          ) : (
            props.slashOptions.map((command, index) => {
              const active = index === props.slashIndex
              const description = command.description ?? command.title
              return (
                <CommandItem
                  key={`${command.type}:${command.name}`}
                  value={command.name.toLowerCase()}
                  data-value={command.name.toLowerCase()}
                  data-component="prompt-slash-option"
                  className={cn(
                    "cursor-pointer select-none items-start justify-between gap-3 px-2.5 py-2 text-left data-selected:bg-transparent data-selected:text-text-base data-selected:*:[svg]:text-text-weak",
                    active && "!bg-surface-raised-base-hover !text-text-strong",
                  )}
                  onMouseMove={() => {
                    if (!active) props.onSetSlashIndex(index)
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() => props.onApplySlash(command)}
                >
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-semibold text-text-stronger">{`/${command.name}`}</span>
                    {description ? (
                      <span className="min-w-0 truncate text-xs leading-4 text-text-weak">
                        {description}
                      </span>
                    ) : null}
                  </div>
                  {command.type === "custom" && command.source && command.source !== "command" ? (
                    <span className="shrink-0 rounded bg-surface-weak px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-text-weak">
                      {command.source}
                    </span>
                  ) : null}
                </CommandItem>
              )
            })
          )
        ) : (
          <>
            {props.showMentionLoading ? (
              <div className="px-3 py-2 text-xs text-text-weak">
                {language.t("prompt.autocomplete.searchingFiles")}
              </div>
            ) : null}
            {!props.showMentionLoading && props.mentionOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-weak">
                {language.t("prompt.autocomplete.noMatches")}
              </div>
            ) : (
              props.mentionOptions.map((option, index) => {
                const active = index === props.mentionIndex
                const key = getMentionOptionKey(option)
                const fileParts =
                  option.type === "file" ? getMentionFilePathParts(option.path) : undefined
                const description =
                  option.type === "file"
                    ? (getMentionFileDescription(option.path) ??
                      (option.recent ? language.t("prompt.autocomplete.recentFile") : undefined))
                    : option.description
                const icon =
                  option.type === "agent" ? (
                    <BotIcon className="size-4 shrink-0 text-text-weak" />
                  ) : option.type === "reference" ? (
                    <FolderOpenIcon className="size-4 shrink-0 text-text-weak" />
                  ) : fileParts?.isDirectory ? (
                    <FolderOpenIcon className="size-4 shrink-0 text-text-weak" />
                  ) : (
                    <FileTextIcon className="size-4 shrink-0 text-text-weak" />
                  )
                const primaryLabel =
                  option.type === "agent"
                    ? `@${option.name}`
                    : option.type === "reference"
                      ? `@${option.name}`
                      : `@${fileParts?.label ?? option.path}`
                return (
                  <CommandItem
                    key={key}
                    value={key.toLowerCase()}
                    data-value={key.toLowerCase()}
                    data-component="prompt-mention-option"
                    className={cn(
                      "cursor-pointer select-none gap-2 px-2 py-1.5 text-left data-selected:bg-transparent data-selected:text-text-base data-selected:*:[svg]:text-text-weak",
                      active && "!bg-surface-raised-base-hover !text-text-strong",
                    )}
                    onMouseMove={() => {
                      if (!active) props.onSetMentionIndex(index)
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onSelect={() => props.onApplyMention(option)}
                  >
                    {icon}
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                      <span className="truncate font-medium">{primaryLabel}</span>
                      {description ? (
                        <span className="truncate text-xs text-text-weak">{description}</span>
                      ) : null}
                    </span>
                  </CommandItem>
                )
              })
            )}
          </>
        )}
      </CommandList>
    </Command>
  )
}
