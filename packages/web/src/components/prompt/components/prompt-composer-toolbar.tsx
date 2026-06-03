import {
  ArrowUpIcon,
  Badge,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
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
import { ImageIcon } from "lucide-react"
import type { RefObject } from "react"
import * as React from "react"
import { language } from "@/context/language"
import { ProviderIcon } from "@/components/provider-icon"
import type { PromptSelectMode } from "../prompt-select-performance"

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
  selectedModelAcceptsImages: boolean
  onModelChange: (model: string) => void
  modelMenuOpenRequest?: number
  modelNativeTriggerRef: RefObject<HTMLSelectElement>
  modelRadixTriggerRef: RefObject<HTMLButtonElement>
  groupedModelOptions: {
    ungrouped: Array<{ key: string; label: string; disabled?: boolean; acceptsImages: boolean }>
    grouped: Array<
      [string, Array<{ key: string; label: string; disabled?: boolean; acceptsImages: boolean }>]
    >
  }
  selectorMode?: PromptSelectMode
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

export const PromptComposerToolbar = React.memo(function PromptComposerToolbar(
  props: PromptComposerToolbarProps,
) {
  const previousModelMenuOpenRequestRef = React.useRef(props.modelMenuOpenRequest)
  const [modelSelectOpen, setModelSelectOpen] = React.useState(false)
  const selectedModelLabel = React.useMemo(() => {
    const allOptions = [
      ...props.groupedModelOptions.ungrouped,
      ...props.groupedModelOptions.grouped.flatMap(([, options]) => options),
    ]
    return allOptions.find((option) => option.key === props.selectedModel)?.label
  }, [props.groupedModelOptions, props.selectedModel])
  React.useEffect(() => {
    if (props.modelMenuOpenRequest === undefined) return
    if (previousModelMenuOpenRequestRef.current === props.modelMenuOpenRequest) return

    previousModelMenuOpenRequestRef.current = props.modelMenuOpenRequest

    const frame = window.requestAnimationFrame(() => {
      const trigger =
        props.selectorMode === "native"
          ? props.modelNativeTriggerRef.current
          : props.modelRadixTriggerRef.current
      if (!(trigger instanceof HTMLElement)) return
      trigger.focus()

      if (props.selectorMode === "native") {
        if ("showPicker" in trigger && typeof trigger.showPicker === "function") {
          trigger.showPicker()
        }
        return
      }

      setModelSelectOpen(true)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [
    props.modelMenuOpenRequest,
    props.modelNativeTriggerRef,
    props.modelRadixTriggerRef,
    props.selectorMode,
  ])

  const isNativeMode = props.selectorMode === "native"
  const primaryButtonStopsRun = !!props.isBusy && !props.canSubmit

  return (
    <div className="bg-transparent px-2 py-2">
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
            className="inline-flex size-7 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-weak/60 hover:text-text-base"
            title={props.attachLabel}
            aria-label={props.attachAriaLabel}
            onClick={props.onAttach}
          >
            <PlusIcon className="size-3.5" />
          </button>

          {isNativeMode ? (
            <NativeSelect
              ref={props.modelNativeTriggerRef}
              value={props.selectedModel}
              onChange={(event) => props.onModelChange(event.currentTarget.value)}
              size="sm"
              aria-label={language.t("prompt.toolbar.aria.model")}
              wrapperClassName="w-[180px] max-w-[180px] min-w-0"
              className="h-7 border-0 bg-surface-raised-base/95 text-xs text-text-weak shadow-none hover:bg-surface-raised-base-hover focus-visible:bg-surface-raised-base-hover focus-visible:text-text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              {props.groupedModelOptions.ungrouped.map((option) => (
                <NativeSelectOption key={option.key} value={option.key} disabled={option.disabled}>
                  {option.label}
                </NativeSelectOption>
              ))}
              {props.groupedModelOptions.grouped.map(([group, options]) => (
                <NativeSelectOptGroup
                  key={group}
                  label={
                    group === "OpenCode Zen" || group === "Opencode Zen"
                      ? "Free (via. Opencode)"
                      : group
                  }
                >
                  {options.map((option) => (
                    <NativeSelectOption
                      key={option.key}
                      value={option.key}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              ))}
            </NativeSelect>
          ) : (
            <Select
              value={props.selectedModel}
              onValueChange={props.onModelChange}
              open={modelSelectOpen}
              onOpenChange={setModelSelectOpen}
            >
              <SelectTrigger
                type="button"
                ref={props.modelRadixTriggerRef}
                size="sm"
                data-action="prompt-model-select"
                className="h-7 max-w-[180px] min-w-0 border-0 bg-surface-raised-base/95 px-2 text-xs text-text-weak shadow-none hover:bg-surface-raised-base-hover focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:border-0 data-[state=open]:bg-surface-raised-base-hover data-[state=open]:text-text-base data-[state=open]:ring-0 [&_svg]:text-inherit [&_svg:last-child]:size-3"
                aria-label={language.t("prompt.toolbar.aria.model")}
              >
                <SelectValue placeholder={language.t("prompt.toolbar.placeholders.model")}>
                  {selectedModelLabel}
                </SelectValue>
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
                    <span className="flex min-w-0 items-center gap-2">
                      {option.key.includes("/") ? (
                        <>
                          <ProviderIcon
                            id={option.key.slice(0, option.key.indexOf("/"))}
                            className="size-4 shrink-0 opacity-60"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        </>
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      )}
                      {option.acceptsImages ? (
                        <ImageIcon
                          className="size-3 shrink-0 text-icon-info-base"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
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
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {option.acceptsImages ? (
                            <ImageIcon
                              className="size-3 shrink-0 text-icon-info-base"
                              aria-hidden="true"
                            />
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}

          {props.thinkingOptions.length <= 1 ? null : isNativeMode ? (
            <NativeSelect
              value={props.selectedThinking}
              onChange={(event) => props.onThinkingChange(event.currentTarget.value)}
              size="sm"
              aria-label={language.t("prompt.toolbar.aria.thinking")}
              wrapperClassName="w-[160px] max-w-[160px] min-w-0"
              className="h-7 border-0 bg-surface-raised-base/95 text-xs text-text-weak shadow-none hover:bg-surface-raised-base-hover focus-visible:bg-surface-raised-base-hover focus-visible:text-text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              {props.thinkingOptions.map((option) => (
                <NativeSelectOption key={option.key} value={option.key}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <Select value={props.selectedThinking} onValueChange={props.onThinkingChange}>
              <SelectTrigger
                type="button"
                size="sm"
                data-action="prompt-thinking-select"
                className="h-7 max-w-[160px] min-w-0 border-0 bg-surface-raised-base/95 px-2 text-xs text-text-weak shadow-none hover:bg-surface-raised-base-hover focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:border-0 data-[state=open]:bg-surface-raised-base-hover data-[state=open]:text-text-base data-[state=open]:ring-0 [&_svg]:text-inherit [&_svg:last-child]:size-3"
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
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type={primaryButtonStopsRun ? "button" : "submit"}
            form="prompt-composer-form"
            data-action="prompt-submit"
            className="inline-flex size-7 items-center justify-center rounded-full bg-surface-interactive-base text-text-on-interactive-base transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!primaryButtonStopsRun && !props.canSubmit}
            aria-label={primaryButtonStopsRun ? props.stopAriaLabel : props.sendAriaLabel}
            title={primaryButtonStopsRun ? props.stopLabel : props.sendLabel}
            onClick={() => {
              if (!primaryButtonStopsRun) return
              props.onAbort?.()
            }}
          >
            {primaryButtonStopsRun ? (
              <SquareIcon className="size-3.5" />
            ) : (
              <ArrowUpIcon className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
})
