import { useMemo, useState } from "react"
import { cn } from "@buddy/ui"
import { CheckIcon, Layers3Icon } from "@/icons/app-icons"
import { MODELS, PROVIDERS, searchModels } from "./catalog"
import {
  Highlight,
  MenuSurface,
  MockComposer,
  ModelTrigger,
  ProviderMark,
  SearchField,
  useListKeyboard,
  useModelChoice,
} from "./shared"

const ALL = "all"

export function ProviderRailVariant() {
  const choice = useModelChoice()
  const [provider, setProvider] = useState(ALL)
  const [query, setQuery] = useState("")
  const matches = useMemo(() => searchModels(MODELS, query), [query])
  const results =
    provider === ALL ? matches : matches.filter((model) => model.providerID === provider)
  const providerName = PROVIDERS.find((entry) => entry.id === provider)?.name
  const nav = useListKeyboard({
    count: results.length,
    resetKey: `${provider}:${query}`,
    onPick: (index) => choice.pick(results[index].key),
  })

  const rail = [{ id: ALL, name: "All providers" }, ...PROVIDERS].map((entry) => ({
    id: entry.id,
    name: entry.name,
    count:
      entry.id === ALL
        ? matches.length
        : matches.filter((model) => model.providerID === entry.id).length,
  }))

  const panel = (
    <MenuSurface className="h-[22rem] w-[34rem] flex-row">
      <nav className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border-weaker-base p-1">
        {rail.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setProvider(entry.id)}
            className={cn(
              "flex h-7 items-center gap-2 rounded-md px-2 text-left text-xs text-text-weak hover:bg-surface-raised-base-hover",
              provider === entry.id && "bg-surface-raised-base-hover text-text-strong",
              entry.count === 0 && "opacity-40",
            )}
          >
            {entry.id === ALL ? (
              <Layers3Icon className="size-3.5 shrink-0" />
            ) : (
              <ProviderMark id={entry.id} className="size-3.5" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <span className="text-[11px] tabular-nums text-text-weaker">{entry.count}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <SearchField
          value={query}
          onChange={setQuery}
          onKeyDown={nav.onKeyDown}
          placeholder={providerName ? `Search ${providerName}…` : "Search every provider…"}
        />
        <div ref={nav.listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-weaker">
              Nothing here{query ? ` for “${query}”` : ""}
            </p>
          ) : null}
          {results.map((model, index) => (
            <button
              key={model.key}
              type="button"
              data-nav-index={index}
              data-active={index === nav.activeIndex}
              onMouseMove={() => nav.setActiveIndex(index)}
              onClick={() => choice.pick(model.key)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left data-[active=true]:bg-surface-raised-base-hover"
            >
              <ProviderMark id={model.providerID} className="size-3.5" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-text-strong">
                <Highlight text={model.name} query={query} />
              </span>
              {provider === ALL ? (
                <span className="shrink-0 text-[11px] text-text-weaker">{model.providerName}</span>
              ) : null}
              <CheckIcon
                className={
                  model.key === choice.model.key
                    ? "size-3.5 text-text-interactive-base"
                    : "size-3.5 opacity-0"
                }
              />
            </button>
          ))}
        </div>
      </div>
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
