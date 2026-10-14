import { useMemo, useState } from "react"
import { CheckIcon } from "@/icons/app-icons"
import { MODELS, PROVIDERS, searchModels, type ModelEntry } from "./catalog"
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

export function SpotlightVariant() {
  const choice = useModelChoice()
  const [query, setQuery] = useState("")
  const groups = useMemo<Array<[string, ModelEntry[]]>>(() => {
    const results = searchModels(MODELS, query)
    if (query.trim()) return [["Best matches", results]]
    return PROVIDERS.map((provider) => [
      provider.name,
      results.filter((model) => model.providerID === provider.id),
    ])
  }, [query])
  const flat = groups.flatMap(([, models]) => models)
  const pick = (model: ModelEntry) => {
    choice.pick(model.key)
    setQuery("")
  }
  const nav = useListKeyboard({
    count: flat.length,
    resetKey: query,
    onPick: (index) => pick(flat[index]),
  })

  const panel = (
    <MenuSurface className="w-[26rem]">
      <SearchField
        value={query}
        onChange={setQuery}
        onKeyDown={nav.onKeyDown}
        placeholder="Search models or providers…"
      />
      <div ref={nav.listRef} className="max-h-80 overflow-y-auto p-1">
        {flat.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-weaker">
            No model matches “{query}”
          </p>
        ) : null}
        {groups.map(([label, models]) =>
          models.length === 0 ? null : (
            <div key={label}>
              <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-text-weaker">{label}</div>
              {models.map((model) => {
                const index = flat.indexOf(model)
                return (
                  <button
                    key={model.key}
                    type="button"
                    data-nav-index={index}
                    data-active={index === nav.activeIndex}
                    onMouseMove={() => nav.setActiveIndex(index)}
                    onClick={() => pick(model)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left data-[active=true]:bg-surface-raised-base-hover"
                  >
                    <ProviderMark id={model.providerID} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] text-text-strong">
                        <Highlight text={model.name} query={query} />
                      </span>
                      {query.trim() ? (
                        <span className="truncate text-[11px] text-text-weaker">
                          <Highlight text={model.providerName} query={query} />
                        </span>
                      ) : null}
                    </span>
                    <CheckIcon
                      className={
                        model.key === choice.model.key
                          ? "size-3.5 text-text-interactive-base"
                          : "size-3.5 opacity-0"
                      }
                    />
                  </button>
                )
              })}
            </div>
          ),
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-border-weaker-base px-3 py-2 text-[11px] text-text-weaker">
        <Kbd>↑↓</Kbd> move <Kbd>↵</Kbd> choose
      </footer>
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
