import { useEffect, useState, type KeyboardEvent } from "react"
import { ChevronDownIcon, cn } from "@buddy/ui"
import { CheckIcon, PinIcon } from "@/icons/app-icons"
import {
  MODELS,
  MODEL_BY_KEY,
  PINNED_KEYS,
  isAmbiguousName,
  searchModels,
  type ModelEntry,
} from "./catalog"
import {
  ALT_LABEL,
  Highlight,
  Kbd,
  MenuSurface,
  MockComposer,
  ProviderMark,
  SearchField,
  useListKeyboard,
  useModelChoice,
} from "./shared"

export function CyclePinsVariant() {
  const choice = useModelChoice()
  const [pinned, setPinned] = useState([...PINNED_KEYS, "github-copilot/claude-sonnet-5"])
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pulse, setPulse] = useState(0)
  const [emphasized, setEmphasized] = useState(false)
  const pinnedModels = pinned.flatMap((key) => MODEL_BY_KEY.get(key) ?? [])

  /** Rotation follows pin order; a model picked from search rejoins the ring at the first pin. */
  const cycle = (step: number) => {
    if (pinnedModels.length === 0) return
    const index = pinnedModels.findIndex((model) => model.key === choice.model.key)
    const next =
      index === -1
        ? step > 0
          ? 0
          : pinnedModels.length - 1
        : (index + step + pinnedModels.length) % pinnedModels.length
    choice.pick(pinnedModels[next].key)
    setPulse((count) => count + 1)
  }

  useEffect(() => {
    if (pulse === 0) return
    setEmphasized(true)
    const timer = window.setTimeout(() => setEmphasized(false), 1200)
    return () => window.clearTimeout(timer)
  }, [pulse])

  const onComposerKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || event.metaKey || event.ctrlKey) return
    if (event.code !== "BracketRight" && event.code !== "BracketLeft") return
    event.preventDefault()
    cycle(event.code === "BracketRight" ? 1 : -1)
  }

  const results = searchModels(MODELS, query)
  const sections: Array<[string, ModelEntry[]]> = [
    [
      "In the rotation",
      query.trim() ? results.filter((model) => pinned.includes(model.key)) : pinnedModels,
    ],
    ["Everything else", results.filter((model) => !pinned.includes(model.key))],
  ]
  const flat = sections.flatMap(([, models]) => models)
  const nav = useListKeyboard({
    count: flat.length,
    resetKey: query,
    onPick: (index) => choice.pick(flat[index].key),
  })
  const togglePin = (key: string) =>
    setPinned(pinned.includes(key) ? pinned.filter((entry) => entry !== key) : [...pinned, key])

  const ring = (
    <div
      className={cn(
        "flex h-7 w-[34rem] max-w-full items-center gap-1 px-1 text-[11px] transition-opacity",
        emphasized ? "opacity-100" : "opacity-60",
      )}
    >
      {pinnedModels.map((model) => (
        <button
          key={model.key}
          type="button"
          title={`${model.name} · ${model.providerName}`}
          onClick={() => choice.pick(model.key)}
          className={cn(
            "inline-flex h-6 min-w-0 items-center gap-1 rounded-full px-2 text-text-weaker hover:text-text-strong",
            model.key === choice.model.key && "bg-surface-raised-base-hover text-text-strong",
          )}
        >
          <ProviderMark id={model.providerID} className="size-3" />
          <span className="truncate">{model.name}</span>
        </button>
      ))}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Kbd>{ALT_LABEL}[</Kbd>
        <Kbd>{ALT_LABEL}]</Kbd>
      </span>
    </div>
  )

  const menu = (
    <MenuSurface className="w-[24rem]">
      <SearchField
        value={query}
        onChange={setQuery}
        onKeyDown={nav.onKeyDown}
        placeholder="Search models to add to the rotation…"
      />
      <div ref={nav.listRef} className="max-h-80 overflow-y-auto p-1">
        {sections.map(([label, models]) =>
          models.length === 0 ? null : (
            <div key={label}>
              <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-text-weaker">{label}</div>
              {models.map((model) => {
                const index = flat.indexOf(model)
                const isPinned = pinned.includes(model.key)
                return (
                  <div
                    key={model.key}
                    role="option"
                    aria-selected={model.key === choice.model.key}
                    data-nav-index={index}
                    data-active={index === nav.activeIndex}
                    onMouseMove={() => nav.setActiveIndex(index)}
                    onClick={() => choice.pick(model.key)}
                    className="group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 data-[active=true]:bg-surface-raised-base-hover"
                  >
                    <ProviderMark id={model.providerID} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-strong">
                      <Highlight text={model.name} query={query} />
                    </span>
                    <span className="shrink-0 text-[11px] text-text-weaker">
                      {model.providerName}
                    </span>
                    {model.key === choice.model.key ? (
                      <CheckIcon className="size-3.5 shrink-0 text-text-interactive-base" />
                    ) : null}
                    <button
                      type="button"
                      aria-label={isPinned ? "Take out of the rotation" : "Add to the rotation"}
                      onClick={(event) => {
                        event.stopPropagation()
                        togglePin(model.key)
                      }}
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded text-text-weaker hover:text-text-strong",
                        isPinned
                          ? "text-text-interactive-base"
                          : "opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100",
                      )}
                    >
                      <PinIcon className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          ),
        )}
      </div>
    </MenuSurface>
  )

  const trigger = (
    <span className="inline-flex h-7 min-w-0 items-center rounded-md hover:bg-surface-raised-base-hover">
      <button
        type="button"
        title={`Next pinned model (${ALT_LABEL}])`}
        onClick={() => cycle(1)}
        className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-l-md pr-1.5 pl-2 text-xs text-text-base hover:text-text-strong"
      >
        <ProviderMark id={choice.model.providerID} className="size-3.5" />
        <span className="truncate">{choice.model.name}</span>
        {isAmbiguousName(choice.model) ? (
          <span className="shrink-0 text-text-weaker">· {choice.model.providerName}</span>
        ) : null}
      </button>
      <span className="h-4 w-px bg-border-weaker-base" />
      <button
        type="button"
        aria-label="Choose which models rotate"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
        className={cn(
          "inline-flex h-7 w-6 items-center justify-center rounded-r-md text-text-weaker hover:text-text-strong",
          menuOpen && "text-text-strong",
        )}
      >
        <ChevronDownIcon className="size-3" />
      </button>
    </span>
  )

  return (
    <div onKeyDown={onComposerKeyDown}>
      <MockComposer
        open
        panel={menuOpen ? menu : ring}
        trigger={trigger}
        prompt={
          <input
            placeholder={`Click here, then press ${ALT_LABEL}] to rotate`}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-text-strong outline-none placeholder:text-text-weaker"
          />
        }
      />
    </div>
  )
}
