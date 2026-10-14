import { useMemo, useState, type KeyboardEvent } from "react"
import { cn } from "@buddy/ui"
import { MODELS, searchModels, type ModelEntry } from "./catalog"
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

type Family = { name: string; routes: ModelEntry[] }

/** One row per model name; every provider that serves it becomes a route on that row. */
function familiesFor(models: ModelEntry[]): Family[] {
  const byName = new Map<string, ModelEntry[]>()
  for (const model of models) byName.set(model.name, [...(byName.get(model.name) ?? []), model])
  return Array.from(byName, ([name, routes]) => ({ name, routes }))
}

const ALL_FAMILIES = familiesFor(MODELS)

export function FamilyRoutesVariant() {
  const choice = useModelChoice()
  const [query, setQuery] = useState("")
  const [routeCursor, setRouteCursor] = useState(0)
  const families = useMemo(() => {
    const order = searchModels(MODELS, query).map((model) => model.name)
    const matchedNames = new Set(order)
    return ALL_FAMILIES.filter((family) => matchedNames.has(family.name)).toSorted(
      (a, b) => order.indexOf(a.name) - order.indexOf(b.name),
    )
  }, [query])
  const nav = useListKeyboard({
    count: families.length,
    resetKey: query,
    onPick: (index) => {
      const routes = families[index].routes
      choice.pick(routes[Math.min(routeCursor, routes.length - 1)].key)
    },
  })
  const activeRoutes = families[nav.activeIndex]?.routes.length ?? 1
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      const step = event.key === "ArrowRight" ? 1 : -1
      setRouteCursor(
        (cursor) => (Math.min(cursor, activeRoutes - 1) + step + activeRoutes) % activeRoutes,
      )
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") setRouteCursor(0)
    nav.onKeyDown(event)
  }

  const panel = (
    <MenuSurface className="w-[30rem]">
      <SearchField
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        placeholder="Search a model, then pick where it runs…"
      />
      <div ref={nav.listRef} className="max-h-[22rem] overflow-y-auto p-1">
        {families.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-weaker">
            No model matches “{query}”
          </p>
        ) : null}
        {families.map((family, index) => {
          const active = index === nav.activeIndex
          return (
            <div
              key={family.name}
              data-nav-index={index}
              data-active={active}
              onMouseMove={() => nav.setActiveIndex(index)}
              className="rounded-md px-2 py-2 data-[active=true]:bg-surface-raised-base-hover"
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium text-text-strong">
                  <Highlight text={family.name} query={query} />
                </span>
                {family.routes.length > 1 ? (
                  <span className="ml-auto text-[11px] text-text-weaker">
                    {family.routes.length} providers
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {family.routes.map((route, routeIndex) => (
                  <button
                    key={route.key}
                    type="button"
                    onClick={() => choice.pick(route.key)}
                    className={cn(
                      "inline-flex h-6 items-center gap-1.5 rounded-full border border-border-weaker-base px-2 text-[11px] text-text-weak hover:border-border-base hover:text-text-strong",
                      active &&
                        routeIndex === Math.min(routeCursor, family.routes.length - 1) &&
                        "border-border-base text-text-strong",
                      route.key === choice.model.key &&
                        "border-transparent bg-surface-interactive-weak text-text-interactive-base",
                    )}
                  >
                    <ProviderMark id={route.providerID} className="size-3" />
                    <Highlight text={route.providerName} query={query} />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <footer className="flex items-center gap-2 border-t border-border-weaker-base px-3 py-2 text-[11px] text-text-weaker">
        <Kbd>↑↓</Kbd> model <Kbd>←→</Kbd> route <Kbd>↵</Kbd> choose
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
