import { useMemo, useState } from "react"
import { cn } from "@buddy/ui"
import { CheckIcon, SearchIcon } from "@/icons/app-icons"
import {
  MODELS,
  MODEL_BY_KEY,
  RECENT_KEYS,
  isAmbiguousName,
  searchModels,
  type ModelEntry,
} from "./catalog"
import {
  Highlight,
  MenuSurface,
  MockComposer,
  ProviderMark,
  SearchField,
  useListKeyboard,
  useModelChoice,
} from "./shared"

function shortName(model: ModelEntry) {
  return model.name.replace(/^Claude /, "")
}

export function QuickSwapVariant() {
  const choice = useModelChoice()
  const [recents, setRecents] = useState(RECENT_KEYS)
  const [query, setQuery] = useState("")
  const results = useMemo(() => searchModels(MODELS, query), [query])
  /** The model you leave becomes the first swap button, so switching back is one tap. */
  const pick = (key: string) => {
    if (key === choice.model.key) return
    setRecents(
      [
        choice.model.key,
        ...recents.filter((entry) => entry !== key && entry !== choice.model.key),
      ].slice(0, 3),
    )
    choice.pick(key)
    setQuery("")
  }
  const nav = useListKeyboard({
    count: results.length,
    resetKey: query,
    onPick: (index) => pick(results[index].key),
  })
  const swaps = recents.flatMap((key) => MODEL_BY_KEY.get(key) ?? [])

  const trigger = (
    <div className="flex min-w-0 items-center gap-0.5">
      <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-surface-raised-base-hover px-2 text-xs text-text-strong">
        <ProviderMark id={choice.model.providerID} className="size-3.5" />
        <span className="truncate">{shortName(choice.model)}</span>
        {isAmbiguousName(choice.model) ? (
          <span className="shrink-0 text-text-weaker">· {choice.model.providerName}</span>
        ) : null}
      </span>
      {swaps.map((model) => (
        <button
          key={model.key}
          type="button"
          title={`Switch to ${model.name} · ${model.providerName}`}
          onClick={() => pick(model.key)}
          className="inline-flex h-7 max-w-[6.5rem] min-w-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-base"
        >
          <ProviderMark id={model.providerID} className="size-3" />
          <span className="truncate">{shortName(model)}</span>
        </button>
      ))}
      <button
        type="button"
        aria-label="Search all models"
        aria-expanded={choice.open}
        onClick={() => choice.setOpen(!choice.open)}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-base",
          choice.open && "bg-surface-raised-base-hover text-text-base",
        )}
      >
        <SearchIcon className="size-3.5" />
      </button>
    </div>
  )

  const panel = (
    <MenuSurface className="w-[22rem]">
      <SearchField
        value={query}
        onChange={setQuery}
        onKeyDown={nav.onKeyDown}
        placeholder="Find any model…"
      />
      <div ref={nav.listRef} className="max-h-64 overflow-y-auto p-1">
        {results.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-weaker">
            No model matches “{query}”
          </p>
        ) : null}
        {results.map((model, index) => (
          <button
            key={model.key}
            type="button"
            data-nav-index={index}
            data-active={index === nav.activeIndex}
            onMouseMove={() => nav.setActiveIndex(index)}
            onClick={() => pick(model.key)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left data-[active=true]:bg-surface-raised-base-hover"
          >
            <ProviderMark id={model.providerID} className="size-3.5" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-text-strong">
              <Highlight text={model.name} query={query} />
            </span>
            <span className="shrink-0 text-[10px] text-text-weaker">{model.providerName}</span>
            {model.key === choice.model.key ? (
              <CheckIcon className="size-3 shrink-0 text-text-interactive-base" />
            ) : null}
          </button>
        ))}
      </div>
      <footer className="border-t border-border-weaker-base px-3 py-2 text-[11px] text-text-weaker">
        The model you switch away from becomes a one-tap button in the toolbar.
      </footer>
    </MenuSurface>
  )

  return <MockComposer open={choice.open} panel={panel} trigger={trigger} />
}
