import { useMemo, useState } from "react"
import { ChevronDownIcon, cn } from "@buddy/ui"
import { PinIcon } from "@/icons/app-icons"
import {
  MODELS,
  MODEL_BY_KEY,
  PINNED_KEYS,
  PROVIDERS,
  RECENT_KEYS,
  searchModels,
  type ModelEntry,
} from "./catalog"
import {
  Highlight,
  Kbd,
  MenuSurface,
  MockComposer,
  ProviderMark,
  useListKeyboard,
  useModelChoice,
} from "./shared"

/** `@copilot sonnet` → scope to GitHub Copilot, then search "sonnet". */
function parseQuery(query: string) {
  const words = query.split(/\s+/)
  const scope = words
    .find((word) => word.startsWith("@") && word.length > 1)
    ?.slice(1)
    .toLowerCase()
  const provider = scope
    ? PROVIDERS.find(
        (entry) => entry.id.includes(scope) || entry.name.toLowerCase().includes(scope),
      )
    : undefined
  return { provider, text: words.filter((word) => !word.startsWith("@")).join(" ") }
}

export function InlineComboboxVariant() {
  const choice = useModelChoice()
  const [query, setQuery] = useState("")
  const [pinned, setPinned] = useState<string[]>(PINNED_KEYS)
  const parsed = parseQuery(query)
  const sections = useMemo<Array<[string, ModelEntry[]]>>(() => {
    if (query.trim()) {
      const scoped = parsed.provider
        ? MODELS.filter((model) => model.providerID === parsed.provider?.id)
        : MODELS
      return [
        [
          parsed.provider ? `In ${parsed.provider.name}` : "Matches",
          searchModels(scoped, parsed.text),
        ],
      ]
    }
    const lookup = (keys: string[]) => keys.flatMap((key) => MODEL_BY_KEY.get(key) ?? [])
    const shown = new Set([...pinned, ...RECENT_KEYS])
    return [
      ["Pinned", lookup(pinned)],
      ["Recent", lookup(RECENT_KEYS.filter((key) => !pinned.includes(key)))],
      ["Everything else", MODELS.filter((model) => !shown.has(model.key))],
    ]
  }, [parsed.provider, parsed.text, pinned, query])
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

  const trigger = choice.open ? (
    <label className="inline-flex h-7 w-[260px] min-w-0 items-center gap-1.5 rounded-md bg-surface-raised-base-hover px-2">
      <ProviderMark id={parsed.provider?.id ?? choice.model.providerID} className="size-3.5" />
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") choice.setOpen(false)
          nav.onKeyDown(event)
        }}
        placeholder={`${choice.model.name} — type to switch`}
        className="min-w-0 flex-1 bg-transparent text-xs text-text-strong outline-none placeholder:text-text-weak"
      />
    </label>
  ) : (
    <button
      type="button"
      onClick={() => choice.setOpen(true)}
      className="inline-flex h-7 max-w-[260px] min-w-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-base"
    >
      <ProviderMark id={choice.model.providerID} className="size-3.5" />
      <span className="truncate">{choice.model.name}</span>
      <span className="shrink-0 text-text-weaker">· {choice.model.providerName}</span>
      <ChevronDownIcon className="size-3 shrink-0" />
    </button>
  )

  const panel = (
    <MenuSurface className="w-[24rem]">
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
                    onClick={() => pick(model)}
                    className="group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 data-[active=true]:bg-surface-raised-base-hover aria-selected:text-text-interactive-base"
                  >
                    <ProviderMark id={model.providerID} className="size-3.5" />
                    <span className="truncate text-[13px] text-text-strong group-aria-selected:text-text-interactive-base">
                      <Highlight text={model.name} query={parsed.text} />
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-text-weaker">
                      {model.providerName}
                    </span>
                    <button
                      type="button"
                      aria-label={isPinned ? "Unpin" : "Pin"}
                      onClick={(event) => {
                        event.stopPropagation()
                        setPinned(
                          isPinned
                            ? pinned.filter((key) => key !== model.key)
                            : [...pinned, model.key],
                        )
                      }}
                      className={cn(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded text-text-weaker hover:text-text-strong",
                        !isPinned && "opacity-0 group-hover:opacity-100",
                        isPinned && "text-text-interactive-base",
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
      <footer className="flex items-center gap-2 border-t border-border-weaker-base px-3 py-2 text-[11px] text-text-weaker">
        <Kbd>@provider</Kbd> scope
        <Kbd>↵</Kbd> choose
        <Kbd>esc</Kbd> close
      </footer>
    </MenuSurface>
  )

  return <MockComposer open={choice.open} panel={panel} trigger={trigger} />
}
