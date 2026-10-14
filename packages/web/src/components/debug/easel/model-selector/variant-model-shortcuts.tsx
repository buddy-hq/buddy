import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { cn } from "@buddy/ui"
import { CheckIcon } from "@/icons/app-icons"
import { MODELS, MODEL_BY_KEY, searchModels, type ModelEntry } from "./catalog"
import {
  ALT_LABEL,
  Highlight,
  Kbd,
  MenuSurface,
  MockComposer,
  ModelTrigger,
  ProviderMark,
  SearchField,
  keyFromCode,
  useListKeyboard,
  useModelChoice,
} from "./shared"

/** Bound key → model key. The modifier is fixed (⌥ / Alt); people only choose the key. */
const DEFAULT_SHORTCUTS = new Map([
  ["1", "anthropic/claude-sonnet-5"],
  ["2", "openai/gpt-5"],
  ["3", "google/gemini-2.5-flash"],
  ["L", "lmstudio/qwen3-coder-30b"],
])

export function ModelShortcutsVariant() {
  const choice = useModelChoice()
  const [shortcuts, setShortcuts] = useState(() => new Map(DEFAULT_SHORTCUTS))
  const [query, setQuery] = useState("")
  const [recording, setRecording] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const keyFor = (modelKey: string) => [...shortcuts].find(([, target]) => target === modelKey)?.[0]
  const sections = useMemo<Array<[string, ModelEntry[]]>>(() => {
    const results = searchModels(MODELS, query)
    const bound = new Set(shortcuts.values())
    return [
      ["With a shortcut", results.filter((model) => bound.has(model.key))],
      ["No shortcut", results.filter((model) => !bound.has(model.key))],
    ]
  }, [query, shortcuts])
  const flat = sections.flatMap(([, models]) => models)
  const pick = (model: ModelEntry) => {
    choice.pick(model.key)
    setQuery("")
  }
  const nav = useListKeyboard({
    count: flat.length,
    resetKey: query,
    onPick: (index) => pick(flat[index]),
  })

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(undefined), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  /** ⌥/Alt + a bound key switches from anywhere inside this composer, menu open or not. */
  const onComposerKeyDown = (event: KeyboardEvent) => {
    if (recording || !event.altKey || event.metaKey || event.ctrlKey) return
    const key = keyFromCode(event.code)
    const target = key ? MODEL_BY_KEY.get(shortcuts.get(key) ?? "") : undefined
    if (!target) return
    event.preventDefault()
    choice.pick(target.key)
    setNotice(`Switched to ${target.name} · ${target.providerName}`)
  }

  const onRecordKeyDown = (event: KeyboardEvent, model: ModelEntry) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") {
      setRecording(undefined)
      return
    }
    const next = new Map([...shortcuts].filter(([, target]) => target !== model.key))
    if (event.key === "Backspace" || event.key === "Delete") {
      setShortcuts(next)
      setRecording(undefined)
      return
    }
    const key = keyFromCode(event.code)
    if (!key) return
    const previous = MODEL_BY_KEY.get(next.get(key) ?? "")
    next.set(key, model.key)
    setShortcuts(next)
    setRecording(undefined)
    if (previous)
      setNotice(`${ALT_LABEL}${key} moved here from ${previous.name} · ${previous.providerName}`)
  }

  const row = (model: ModelEntry) => {
    const index = flat.indexOf(model)
    const key = keyFor(model.key)
    const isRecording = recording === model.key
    return (
      <div
        key={model.key}
        role="option"
        aria-selected={model.key === choice.model.key}
        data-nav-index={index}
        data-active={index === nav.activeIndex}
        onMouseMove={() => nav.setActiveIndex(index)}
        onClick={() => pick(model)}
        className="group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 data-[active=true]:bg-surface-raised-base-hover"
      >
        <ProviderMark id={model.providerID} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-text-strong">
          <Highlight text={model.name} query={query} />
        </span>
        <span className="shrink-0 text-[11px] text-text-weaker">{model.providerName}</span>
        {model.key === choice.model.key ? (
          <CheckIcon className="size-3.5 shrink-0 text-text-interactive-base" />
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setRecording(isRecording ? undefined : model.key)
          }}
          onKeyDown={isRecording ? (event) => onRecordKeyDown(event, model) : undefined}
          onBlur={() => {
            if (isRecording) setRecording(undefined)
          }}
          className={cn(
            "inline-flex h-6 min-w-[5.5rem] shrink-0 items-center justify-center rounded border px-1.5 text-[11px]",
            isRecording && "border-border-base text-text-strong",
            !isRecording &&
              key &&
              "border-border-weaker-base text-text-weak hover:text-text-strong",
            !isRecording &&
              !key &&
              "border-transparent text-text-weaker opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100 hover:text-text-strong",
          )}
        >
          {isRecording ? "Press a key…" : key ? `${ALT_LABEL}${key}` : "Set shortcut"}
        </button>
      </div>
    )
  }

  const panel = (
    <MenuSurface className="w-[28rem]">
      <SearchField
        value={query}
        onChange={setQuery}
        onKeyDown={nav.onKeyDown}
        placeholder="Search models…"
      />
      <div ref={nav.listRef} className="max-h-80 overflow-y-auto p-1">
        {flat.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-weaker">
            No model matches “{query}”
          </p>
        ) : null}
        {sections.map(([label, models]) =>
          models.length === 0 ? null : (
            <div key={label}>
              <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-text-weaker">{label}</div>
              {models.map((model) => row(model))}
            </div>
          ),
        )}
      </div>
      <footer className="border-t border-border-weaker-base px-3 py-2 text-[11px] text-text-weaker">
        {recording
          ? "Press a letter or number · Backspace clears · Esc cancels"
          : `Press ${ALT_LABEL}key while typing to switch without opening this menu.`}
      </footer>
    </MenuSurface>
  )

  const currentKey = keyFor(choice.model.key)

  return (
    <div className="flex flex-col gap-2" onKeyDown={onComposerKeyDown}>
      <MockComposer
        open={choice.open}
        panel={panel}
        prompt={
          <input
            placeholder={`Click here, then press ${ALT_LABEL}1, ${ALT_LABEL}2 or ${ALT_LABEL}L`}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-text-strong outline-none placeholder:text-text-weaker"
          />
        }
        trigger={
          <span className="flex min-w-0 items-center gap-1">
            <ModelTrigger
              model={choice.model}
              open={choice.open}
              onClick={() => choice.setOpen(!choice.open)}
            />
            {currentKey ? (
              <Kbd>
                {ALT_LABEL}
                {currentKey}
              </Kbd>
            ) : null}
          </span>
        }
      />
      <p className="h-4 text-[11px] text-text-weaker">{notice}</p>
    </div>
  )
}
