import {
  Badge,
  BookOpenIcon,
  BrainIcon,
  cn,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SparklesIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TargetIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  XIcon,
} from "@buddy/ui"
import type { ComponentType, RefObject } from "react"
import { language } from "@/context/language"
import type { TeachingIntent } from "@/state/teaching-runtime"

const INTENT_OPTIONS: Array<{
  key: TeachingIntent
  label: string
  icon: ComponentType<{ className?: string }>
  description: string
  tooltip: string
}> = [
  {
    key: "auto",
    label: language.t("prompt.toolbar.intents.auto.label"),
    icon: SparklesIcon,
    description: language.t("prompt.toolbar.intents.auto.description"),
    tooltip: language.t("prompt.toolbar.intents.auto.tooltip"),
  },
  {
    key: "learn",
    label: language.t("prompt.toolbar.intents.learn.label"),
    icon: BookOpenIcon,
    description: language.t("prompt.toolbar.intents.learn.description"),
    tooltip: language.t("prompt.toolbar.intents.learn.tooltip"),
  },
  {
    key: "practice",
    label: language.t("prompt.toolbar.intents.practice.label"),
    icon: TargetIcon,
    description: language.t("prompt.toolbar.intents.practice.description"),
    tooltip: language.t("prompt.toolbar.intents.practice.tooltip"),
  },
  {
    key: "assess",
    label: language.t("prompt.toolbar.intents.assess.label"),
    icon: BrainIcon,
    description: language.t("prompt.toolbar.intents.assess.description"),
    tooltip: language.t("prompt.toolbar.intents.assess.tooltip"),
  },
]

type PromptComposerToolbarProps = {
  pendingSteerLabel?: string
  onClearPendingSteer?: () => void
  selectedIntent: TeachingIntent
  onIntentChange: (intent: TeachingIntent) => void
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
  sessionContextUsage?: React.ReactNode
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
          <TooltipProvider delayDuration={300}>
            <Tabs
              value={props.selectedIntent}
              onValueChange={(value) => {
                if (
                  value === "auto" ||
                  value === "learn" ||
                  value === "practice" ||
                  value === "assess"
                ) {
                  props.onIntentChange(value)
                }
              }}
              className="w-auto"
            >
              <TabsList
                variant="default"
                className="h-7 bg-surface-raised-base/85 ring-border-base/70 p-0.5 ring-1"
              >
                {INTENT_OPTIONS.map((intent) => {
                  const Icon = intent.icon
                  const isSelected = props.selectedIntent === intent.key
                  return (
                    <Tooltip key={intent.key}>
                      <TooltipTrigger asChild>
                        <TabsTrigger
                          value={intent.key}
                          className="h-6 gap-1.5 border border-transparent px-2 text-[11px] text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong data-[state=active]:border-border-interactive-base data-[state=active]:bg-surface-interactive-base data-[state=active]:text-text-on-interactive-base data-[state=active]:shadow-xs [&_svg]:size-3.5 shadow-none"
                        >
                          <Icon className="shrink-0" />
                          <span
                            className={cn(
                              "whitespace-nowrap overflow-hidden transition-all duration-500 ease-out",
                              isSelected ? "max-w-[80px] opacity-100" : "max-w-0 opacity-0",
                            )}
                          >
                            {intent.label}
                          </span>
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" sideOffset={4}>
                        <p className="text-xs">{intent.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </TabsList>
            </Tabs>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-1">
          <Select value={props.selectedPersona} onValueChange={props.onPersonaChange}>
            <SelectTrigger
              size="sm"
              className="h-7 max-w-[140px] min-w-0 border-border-base/70 bg-input-base px-2 text-xs text-text-strong shadow-xs hover:border-border-hover hover:bg-input-hover"
              aria-label={language.t("prompt.toolbar.aria.persona")}
            >
              <SelectValue placeholder={language.t("prompt.toolbar.placeholders.persona")} />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="end"
              position="popper"
              sideOffset={6}
              className="w-[min(16rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100vh-8rem))]"
            >
              {props.personaOptions.map((persona) => (
                <SelectItem key={persona.name} value={persona.name}>
                  {persona.label ?? persona.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={props.selectedModel}
            onValueChange={props.onModelChange}
            open={props.modelMenuOpen}
            onOpenChange={props.onModelMenuOpenChange}
          >
            <SelectTrigger
              ref={props.modelTriggerRef}
              size="sm"
              className="h-7 max-w-[180px] min-w-0 border-border-base/70 bg-input-base px-2 text-xs text-text-strong shadow-xs hover:border-border-hover hover:bg-input-hover"
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
                  {option.label}
                </SelectItem>
              ))}
              {props.groupedModelOptions.grouped.map(([group, options]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {options.map((option) => (
                    <SelectItem key={option.key} value={option.key} disabled={option.disabled}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.selectedThinking} onValueChange={props.onThinkingChange}>
            <SelectTrigger
              size="sm"
              className="h-7 max-w-[160px] min-w-0 border-border-base/70 bg-input-base px-2 text-xs text-text-strong shadow-xs hover:border-border-hover hover:bg-input-hover"
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

          {props.sessionContextUsage}
        </div>
      </div>
    </div>
  )
}
