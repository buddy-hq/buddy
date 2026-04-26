import {
  ArrowUpIcon,
  Badge,
  PlusIcon,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SquareIcon,
  XIcon,
} from "@buddy/ui"
import type { RefObject } from "react"
import * as React from "react"
import { language } from "@/context/language"
import { ProviderIcon } from "@/components/provider-icon"

type PromptComposerToolbarProps = {
  pendingSteerLabel?: string
  onClearPendingSteer?: () => void
  selectedPersona: string
  personaOptions: Array<{
    name: string
    label?: string
  }>
  onPersonaChange: (persona: string) => void
  selectedModel: string
  onModelChange: (model: string) => void
  modelMenuOpen: boolean
  onModelMenuOpenChange: (open: boolean) => void
  modelTriggerRef: RefObject<HTMLButtonElement>
  groupedModelOptions: {
    ungrouped: Array<{ key: string; label: string; disabled?: boolean }>
    grouped: Array<[string, Array<{ key: string; label: string; disabled?: boolean }>]>
  }
  selectedThinking: string
  thinkingOptions: Array<{ key: string; label: string }>
  onThinkingChange: (thinking: string) => void
  personaDropdown?: React.ReactNode
  isBusy?: boolean
  canSubmit?: boolean
  onAttach?: () => void
  onAbort?: () => void
  attachLabel?: string
  attachAriaLabel?: string
  sendLabel?: string
  sendAriaLabel?: string
  stopLabel?: string
  stopAriaLabel?: string
}

export function PromptComposerToolbar(props: PromptComposerToolbarProps) {
  return (
    <div className="-mt-3.5 rounded-[12px] rounded-tl-none rounded-tr-none border border-t-0 bg-surface-raised-base/95 px-2 pt-5 pb-2">
      {props.pendingSteerLabel ? (
        <div className="mb-2 flex min-w-0 items-center gap-2 px-1">
          <Badge variant="secondary" className="max-w-full gap-1.5 px-2 py-1 text-[11px]">
            <span className="truncate">{props.pendingSteerLabel}</span>
            {props.onClearPendingSteer ? (
              <button
                type="button"
                className="shrink-0 rounded-sm text-text-weak hover:text-text-base"
                aria-label={language.t("prompt.toolbar.clearPendingSteerAria")}
                onClick={props.onClearPendingSteer}
              >
                <XIcon className="size-3" />
              </button>
            ) : null}
          </Badge>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-action="prompt-attach"
            className="inline-flex size-7 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-weak/60 hover:text-text-base"
            title={props.attachLabel}
            aria-label={props.attachAriaLabel}
            onClick={props.onAttach}
          >
            <PlusIcon className="size-3.5" />
          </button>

          <Select
            value={props.selectedModel}
            onValueChange={props.onModelChange}
            open={props.modelMenuOpen}
            onOpenChange={props.onModelMenuOpenChange}
          >
            <SelectTrigger
              type="button"
              data-action="prompt-model-select"
              ref={props.modelTriggerRef}
              size="sm"
              className="h-7 max-w-[180px] min-w-0 border-0 bg-surface-raised-base/95 px-2 text-xs text-text-weak shadow-none hover:bg-surface-raised-base-hover focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-0 data-[state=open]:bg-surface-raised-base-hover data-[state=open]:text-text-base data-[state=open]:ring-0 data-[state=open]:border-0 [&_svg]:text-inherit [&_svg:last-child]:size-3"
              aria-label={language.t("prompt.toolbar.aria.model")}
            >
              <SelectValue placeholder={language.t("prompt.toolbar.placeholders.model")} />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              position="popper"
              sideOffset={6}
              className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-8rem))]"
            >
              {props.groupedModelOptions.ungrouped.map((option) => (
                <SelectItem key={option.key} value={option.key} disabled={option.disabled}>
                  {option.key.includes("/") ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <ProviderIcon
                        id={option.key.slice(0, option.key.indexOf("/"))}
                        className="size-4 shrink-0 opacity-60"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">{option.label}</span>
                    </span>
                  ) : (
                    option.label
                  )}
                </SelectItem>
              ))}
              {props.groupedModelOptions.grouped.map(([group, options]) => (
                <SelectGroup key={group}>
                  <SelectLabel>
                    {group === "OpenCode Zen" || group === "Opencode Zen"
                      ? "Free (via. Opencode)"
                      : group}
                  </SelectLabel>
                  {options.map((option) => (
                    <SelectItem key={option.key} value={option.key} disabled={option.disabled}>
                      <span className="flex min-w-0 items-center gap-2">
                        <ProviderIcon
                          id={option.key.slice(0, option.key.indexOf("/"))}
                          className="size-4 shrink-0 opacity-60"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 truncate">{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.selectedThinking} onValueChange={props.onThinkingChange}>
            <SelectTrigger
              type="button"
              data-action="prompt-thinking-select"
              size="sm"
              className="h-7 max-w-[160px] min-w-0 border-0 bg-surface-raised-base/95 px-2 text-xs text-text-weak shadow-none hover:bg-surface-raised-base-hover focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-0 data-[state=open]:bg-surface-raised-base-hover data-[state=open]:text-text-base data-[state=open]:ring-0 data-[state=open]:border-0 [&_svg]:text-inherit [&_svg:last-child]:size-3"
              aria-label={language.t("prompt.toolbar.aria.thinking")}
            >
              <SelectValue placeholder={language.t("prompt.toolbar.placeholders.thinking")} />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              position="popper"
              sideOffset={6}
              className="w-[min(18rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100vh-8rem))]"
            >
              {props.thinkingOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type={props.isBusy ? "button" : "submit"}
            form="prompt-composer-form"
            data-action="prompt-submit"
            className="inline-flex size-7 items-center justify-center rounded-md bg-surface-interactive-base text-text-on-interactive-base transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.isBusy && !props.canSubmit}
            aria-label={props.isBusy ? props.stopAriaLabel : props.sendAriaLabel}
            title={props.isBusy ? props.stopLabel : props.sendLabel}
            onClick={() => {
              if (!props.isBusy) return
              props.onAbort?.()
            }}
          >
            {props.isBusy ? (
              <SquareIcon className="size-3.5" />
            ) : (
              <ArrowUpIcon className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
