import { cn } from "@buddy/ui"
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
}

export function PromptAutocompleteMenu(props: PromptAutocompleteMenuProps) {
  if (!props.slashVisible && !props.mentionVisible && !props.showMentionLoading) {
    return null
  }

  return (
    <div className="absolute inset-x-2 bottom-16 z-20 max-h-80 overflow-y-auto rounded-xl border bg-surface-raised-stronger-non-alpha/95 shadow-lg backdrop-blur">
      {props.slashVisible ? (
        props.slashOptions.map((command, index) => {
          const active = index === props.slashIndex
          return (
            <button
              key={`${command.type}:${command.name}`}
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "bg-surface-weak text-text-base"
                  : "text-text-base hover:bg-surface-weak/70",
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                props.onApplySlash(command)
              }}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{`/${command.name}`}</span>
                {command.description ? (
                  <span className="truncate text-xs text-text-weak">{command.description}</span>
                ) : command.title ? (
                  <span className="truncate text-xs text-text-weak">{command.title}</span>
                ) : null}
              </div>
              {command.type === "custom" && command.source && command.source !== "command" ? (
                <span className="shrink-0 rounded bg-surface-weak px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-text-weak">
                  {command.source}
                </span>
              ) : null}
            </button>
          )
        })
      ) : (
        <>
          {props.showMentionLoading ? (
            <div className="px-3 py-2 text-xs text-text-weak">Searching files...</div>
          ) : null}
          {props.mentionOptions.map((option, index) => {
            const active = index === props.mentionIndex
            return (
              <button
                key={option.type === "agent" ? `agent:${option.name}` : `file:${option.path}`}
                type="button"
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-surface-weak text-text-base"
                    : "text-text-base hover:bg-surface-weak/70",
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                  props.onApplyMention(option)
                }}
              >
                <span className="font-medium">
                  {option.type === "agent" ? `@${option.name}` : `@${option.path}`}
                </span>
                {option.description ? (
                  <span className="text-xs text-text-weak">{option.description}</span>
                ) : option.type === "file" && option.recent ? (
                  <span className="text-xs text-text-weak">Recent file</span>
                ) : null}
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
