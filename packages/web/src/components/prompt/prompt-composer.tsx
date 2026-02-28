import {
  ArrowUpIcon,
  PlusIcon,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SquareIcon,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import { useMemo } from "react"
import { promptPlaceholder } from "./placeholder"
import { createPromptSubmit } from "./submit"

type PromptComposerProps = {
  value: string
  isBusy: boolean
  agentOptions: Array<{
    name: string
  }>
  modelOptions: Array<{
    key: string
    label: string
    group?: string
    disabled?: boolean
  }>
  selectedAgent: string
  selectedModel: string
  thinkingOptions: Array<{
    key: string
    label: string
  }>
  selectedThinking: string
  onChange: (value: string) => void
  onAgentChange: (agent: string) => void
  onModelChange: (model: string) => void
  onThinkingChange: (thinking: string) => void
  onSubmit: () => void
  onAbort: () => void
  className?: string
}

function translatePromptPlaceholder(key: string, params?: Record<string, string>) {
  if (key === "prompt.placeholder.shell") return "Run a shell command"
  if (key === "prompt.placeholder.summarizeComments") return "Summarize these comments"
  if (key === "prompt.placeholder.summarizeComment") return "Summarize this comment"
  if (key === "prompt.placeholder.normal") {
    if (params?.example) return `Try: ${params.example}`
    return "Ask Buddy"
  }
  return "Ask Buddy"
}

export function PromptComposer(props: PromptComposerProps) {
  const canSubmit = useMemo(() => !props.isBusy && props.value.trim().length > 0, [props.isBusy, props.value])
  const agentOptions = useMemo(() => {
    if (props.agentOptions.length > 0) return props.agentOptions
    return props.selectedAgent ? [{ name: props.selectedAgent }] : [{ name: "build" }]
  }, [props.agentOptions, props.selectedAgent])
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

  const submit = createPromptSubmit({
    value: () => props.value,
    isBusy: () => props.isBusy,
    onSubmit: props.onSubmit,
    onAbort: props.onAbort,
  })

  return (
    <div className={props.className ?? "mx-4 mb-4"}>
      <form
        className="group/prompt-input relative z-10 rounded-[12px] border bg-card shadow-sm"
        onSubmit={(event) => submit.handleSubmit(event)}
      >
        <div className="relative">
          <textarea
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) =>
              submit.handleKeyDown({
                key: event.key,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                isComposing: event.nativeEvent.isComposing,
                preventDefault: () => event.preventDefault(),
              })
            }
            placeholder={placeholder}
            className="w-full min-h-[84px] max-h-[240px] resize-none overflow-y-auto rounded-[12px] border-0 bg-transparent pl-3 pr-24 pt-2 pb-11 text-sm leading-6 text-foreground focus:outline-none"
          />

          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Attach (coming soon)"
              aria-label="Attach"
              disabled
            >
              <PlusIcon className="size-4" />
            </button>

            <button
              type="submit"
              className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isBusy && !canSubmit}
              aria-label={props.isBusy ? "Stop" : "Send"}
              title={props.isBusy ? "Stop" : "Send"}
            >
              {props.isBusy ? <SquareIcon className="size-3.5" /> : <ArrowUpIcon className="size-4" />}
            </button>
          </div>
        </div>
      </form>

      <div className="-mt-3.5 rounded-[12px] rounded-tl-none rounded-tr-none border border-t-0 bg-card/95 px-2 pt-5 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Select value={props.selectedAgent} onValueChange={props.onAgentChange}>
            <SelectTrigger
              size="sm"
              className="h-7 max-w-[160px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
              aria-label="Agent"
            >
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              position="popper"
              sideOffset={6}
              className="w-[min(18rem,calc(100vw-2rem))] max-h-[min(20rem,calc(100vh-8rem))]"
            >
              {agentOptions.map((agent) => (
                <SelectItem key={agent.name} value={agent.name}>
                  {`Agent: ${agent.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.selectedModel} onValueChange={props.onModelChange}>
            <SelectTrigger
              size="sm"
              className="h-7 max-w-[240px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
              aria-label="Model"
            >
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              position="popper"
              sideOffset={6}
              className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-8rem))]"
            >
              {groupedModelOptions.ungrouped.map((option) => (
                <SelectItem key={option.key} value={option.key} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
              {groupedModelOptions.grouped.map(([group, options]) => (
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
              className="h-7 max-w-[160px] min-w-0 border-transparent bg-transparent px-2 text-xs text-foreground/90 shadow-none hover:bg-muted/50 focus-visible:ring-0"
              aria-label="Thinking"
            >
              <SelectValue placeholder="Thinking" />
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

          <div className="ml-auto inline-flex items-center rounded-md border bg-background p-0.5">
            <button
              type="button"
              className="h-6 rounded px-2 text-[11px] font-medium bg-primary text-primary-foreground"
              aria-pressed="true"
            >
              Prompt
            </button>
            <button
              type="button"
              className="h-6 rounded px-2 text-[11px] text-muted-foreground"
              disabled
              aria-pressed="false"
            >
              Shell
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
