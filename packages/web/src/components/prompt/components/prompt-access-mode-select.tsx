import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  NativeSelect,
  NativeSelectOption,
  cn,
} from "@buddy/ui"
import { ShieldAlert, ShieldCheckIcon, ShieldIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import type { PromptSelectMode } from "../prompt-select-performance"

export type PromptAccessMode = "supervised" | "default" | "full"

export type PromptAccessModeOption = {
  readonly mode: PromptAccessMode
  readonly label: string
  readonly description: string
}

type PromptAccessModeSelectProps = {
  readonly mode: PromptAccessMode
  readonly options: readonly PromptAccessModeOption[]
  readonly onModeChange: (mode: PromptAccessMode) => void
  readonly selectorMode?: PromptSelectMode
}

function isPromptAccessMode(
  options: readonly PromptAccessModeOption[],
  value: string,
): value is PromptAccessMode {
  return options.some((option) => option.mode === value)
}

function AccessModeIcon(props: { mode: PromptAccessMode }) {
  if (props.mode === "full") return <ShieldAlert className="size-3.5" />
  if (props.mode === "supervised") return <ShieldCheckIcon className="size-3.5" />
  return <ShieldIcon className="size-3.5" />
}

export function PromptAccessModeSelect(props: PromptAccessModeSelectProps) {
  const selected = props.options.find((option) => option.mode === props.mode)
  const triggerLabel = language.t("prompt.accessMode.trigger", {
    mode: selected?.label ?? props.mode,
  })

  if (props.selectorMode === "native") {
    return (
      <NativeSelect
        value={props.mode}
        onChange={(event) => {
          const value = event.currentTarget.value
          if (isPromptAccessMode(props.options, value)) props.onModeChange(value)
        }}
        size="sm"
        data-action="prompt-access-mode"
        wrapperClassName="w-[120px] max-w-[120px] min-w-0"
        className={cn(
          "h-6 border-0 bg-transparent text-xs text-text-weaker shadow-none hover:bg-transparent focus-visible:text-text-base focus-visible:ring-0 focus-visible:ring-offset-0",
          props.mode === "full" && "font-medium text-text-warning-base",
        )}
        aria-label={triggerLabel}
      >
        {props.options.map((option) => (
          <NativeSelectOption key={option.mode} value={option.mode}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-action="prompt-access-mode"
          data-mode={props.mode}
          aria-label={triggerLabel}
          title={triggerLabel}
          className={cn(
            "inline-flex h-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base/50 active:scale-95",
            props.mode === "full"
              ? "gap-1 bg-surface-warning-weak px-1.5 text-[11px] font-medium text-text-warning-base ring-1 ring-border-warning-base/60 hover:bg-surface-warning-base"
              : "w-6 text-text-weaker hover:bg-surface-base-hover hover:text-text-base data-[state=open]:bg-surface-base-hover data-[state=open]:text-text-base",
          )}
        >
          <AccessModeIcon mode={props.mode} />
          {props.mode === "full" ? selected?.label : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={6}
        className="w-[min(18rem,calc(100vw-2rem))]"
      >
        <DropdownMenuRadioGroup
          value={props.mode}
          onValueChange={(value) => {
            if (isPromptAccessMode(props.options, value)) props.onModeChange(value)
          }}
        >
          {props.options.map((option) => (
            <DropdownMenuRadioItem
              key={option.mode}
              value={option.mode}
              data-mode={option.mode}
              className="items-start py-1.5"
            >
              <span className="mt-0.5 text-text-weaker">
                <AccessModeIcon mode={option.mode} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-xs font-medium",
                    option.mode === "full" && "text-text-warning-base",
                  )}
                >
                  {option.label}
                </span>
                <span className="text-[11px] leading-snug text-text-weaker">
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
