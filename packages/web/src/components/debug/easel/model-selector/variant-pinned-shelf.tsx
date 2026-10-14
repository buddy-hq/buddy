import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "@buddy/ui"
import { CheckIcon, ChevronUpIcon, PinIcon } from "@/icons/app-icons"
import { MODELS, MODEL_BY_KEY, PINNED_KEYS, searchModels, type ModelEntry } from "./catalog"
import {
  Highlight,
  Kbd,
  MenuSurface,
  MockComposer,
  ModelTrigger,
  ProviderMark,
  SearchField,
  useListKeyboard,
  useModelChoice,
} from "./shared"

function RowAction(props: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={(event) => {
        event.stopPropagation()
        props.onClick()
      }}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded text-text-weaker opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100 hover:text-text-strong",
        props.active && "text-text-interactive-base",
      )}
    >
      {props.children}
    </button>
  )
}

export function PinnedShelfVariant() {
  const choice = useModelChoice()
  const [pinned, setPinned] = useState([...PINNED_KEYS, "google/gemini-2.5-flash"])
  const [query, setQuery] = useState("")
  const [browsing, setBrowsing] = useState(false)
  const searching = query.trim().length > 0
  const pinnedModels = pinned.flatMap((key) => MODEL_BY_KEY.get(key) ?? [])
  const shelf = searching ? searchModels(pinnedModels, query) : pinnedModels
  const others = useMemo(() => {
    if (!searching && !browsing) return []
    return searchModels(
      MODELS.filter((model) => !pinned.includes(model.key)),
      query,
    )
  }, [browsing, pinned, query, searching])
  const flat = [...shelf, ...others]
  const pick = (model: ModelEntry) => {
    choice.pick(model.key)
    setQuery("")
  }
  const nav = useListKeyboard({
    count: flat.length,
    resetKey: `${query}:${browsing}`,
    onPick: (index) => pick(flat[index]),
  })
  const togglePin = (key: string) =>
    setPinned(pinned.includes(key) ? pinned.filter((entry) => entry !== key) : [...pinned, key])
  const moveUp = (key: string) => {
    const index = pinned.indexOf(key)
    if (index <= 0) return
    const next = [...pinned]
    next.splice(index - 1, 2, pinned[index], pinned[index - 1])
    setPinned(next)
  }
  /** With an empty search, 1–9 picks a pin straight away. */
  const onKeyDown = (event: KeyboardEvent) => {
    if (!searching && /^[1-9]$/.test(event.key)) {
      const model = pinnedModels[Number(event.key) - 1]
      if (model) {
        event.preventDefault()
        pick(model)
      }
      return
    }
    nav.onKeyDown(event)
  }

  const row = (model: ModelEntry, index: number, number?: number) => (
    <div
      key={model.key}
      role="option"
      aria-selected={model.key === choice.model.key}
      data-nav-index={index}
      data-active={index === nav.activeIndex}
      onMouseMove={() => nav.setActiveIndex(index)}
      onClick={() => pick(model)}
      className="group flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 data-[active=true]:bg-surface-raised-base-hover"
    >
      {number === undefined ? null : (
        <span className="w-3 shrink-0 text-center text-[11px] tabular-nums text-text-weaker">
          {number}
        </span>
      )}
      <ProviderMark id={model.providerID} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] text-text-strong">
          <Highlight text={model.name} query={query} />
        </span>
        <span className="truncate text-[11px] text-text-weaker">
          <Highlight text={model.providerName} query={query} />
        </span>
      </span>
      {model.key === choice.model.key ? (
        <CheckIcon className="size-3.5 shrink-0 text-text-interactive-base" />
      ) : null}
      {number !== undefined && number > 1 ? (
        <RowAction label="Move up" onClick={() => moveUp(model.key)}>
          <ChevronUpIcon className="size-3.5" />
        </RowAction>
      ) : null}
      <RowAction
        label={pinned.includes(model.key) ? "Unpin" : "Pin"}
        active={pinned.includes(model.key)}
        onClick={() => togglePin(model.key)}
      >
        <PinIcon className="size-3" />
      </RowAction>
    </div>
  )

  const panel = (
    <MenuSurface className="w-[24rem]">
      <SearchField
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        placeholder="Search models…"
      />
      <div ref={nav.listRef} className="max-h-[22rem] overflow-y-auto p-1">
        <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-text-weaker">Pinned</div>
        {shelf.length === 0 ? (
          <p className="px-2 pb-2 text-xs text-text-weaker">
            {searching ? "No pinned model matches" : "Pin a model to keep it here"}
          </p>
        ) : null}
        {shelf.map((model, index) => row(model, index, searching ? undefined : index + 1))}
        {others.length > 0 ? (
          <div className="px-2 pt-3 pb-1 text-[11px] font-medium text-text-weaker">
            {searching ? "Other models" : "All models"}
          </div>
        ) : null}
        {others.map((model, index) => row(model, shelf.length + index))}
      </div>
      {searching ? null : (
        <button
          type="button"
          onClick={() => setBrowsing(!browsing)}
          className="flex h-9 items-center gap-2 border-t border-border-weaker-base px-3 text-left text-xs text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
        >
          {browsing ? "Show pinned only" : `Browse all ${MODELS.length} models`}
          {pinned.length > 0 ? (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-text-weaker">
              <Kbd>1</Kbd>–<Kbd>{Math.min(9, pinned.length)}</Kbd> picks a pin
            </span>
          ) : null}
        </button>
      )}
    </MenuSurface>
  )

  return (
    <MockComposer
      open={choice.open}
      panel={panel}
      trigger={
        <ModelTrigger
          model={choice.model}
          open={choice.open}
          onClick={() => choice.setOpen(!choice.open)}
        />
      }
    />
  )
}
