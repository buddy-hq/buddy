import { useMemo, useState, type KeyboardEvent } from "react"
import { ChevronDownIcon, cn } from "@buddy/ui"
import { CheckIcon, PencilIcon } from "@/icons/app-icons"
import { DEFAULT_ALIASES, MODELS, MODEL_BY_KEY, searchModels, type ModelEntry } from "./catalog"
import {
  Highlight,
  MenuSurface,
  MockComposer,
  ProviderMark,
  SearchField,
  useListKeyboard,
  useModelChoice,
} from "./shared"

export function AliasesVariant() {
  const choice = useModelChoice()
  const [aliases, setAliases] = useState(() => new Map(DEFAULT_ALIASES))
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<string>()
  const [draft, setDraft] = useState("")
  const sections = useMemo<Array<[string, ModelEntry[]]>>(() => {
    const results = searchModels(MODELS, query, aliases)
    return [
      ["Your names", results.filter((model) => aliases.has(model.key))],
      ["Other models", results.filter((model) => !aliases.has(model.key))],
    ]
  }, [aliases, query])
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

  /** Names must be unique — they're what you type to find a model. */
  const clashKey = editing
    ? [...aliases].find(
        ([key, name]) => key !== editing && name.toLowerCase() === draft.trim().toLowerCase(),
      )?.[0]
    : undefined
  const clashModel = clashKey ? MODEL_BY_KEY.get(clashKey) : undefined
  const startEditing = (key: string) => {
    setEditing(key)
    setDraft(aliases.get(key) ?? "")
  }
  const save = () => {
    if (!editing || clashModel) return
    const next = new Map(aliases)
    if (draft.trim()) next.set(editing, draft.trim())
    else next.delete(editing)
    setAliases(next)
    setEditing(undefined)
  }
  const onEditKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") save()
    if (event.key === "Escape") setEditing(undefined)
  }
  const currentAlias = aliases.get(choice.model.key)

  const trigger = (
    <button
      type="button"
      aria-expanded={choice.open}
      title={`${choice.model.name} · ${choice.model.providerName}`}
      onClick={() => choice.setOpen(!choice.open)}
      className={cn(
        "inline-flex h-7 max-w-[260px] min-w-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-base",
        choice.open && "bg-surface-raised-base-hover text-text-base",
      )}
    >
      <ProviderMark id={choice.model.providerID} className="size-3.5" />
      {currentAlias ? (
        <span className="truncate font-medium text-text-strong">{currentAlias}</span>
      ) : null}
      <span className="truncate">{choice.model.name}</span>
      <ChevronDownIcon className="size-3 shrink-0" />
    </button>
  )

  const row = (model: ModelEntry) => {
    const index = flat.indexOf(model)
    const alias = aliases.get(model.key)
    if (editing === model.key) {
      return (
        <div
          key={model.key}
          className="flex flex-col gap-1 rounded-md bg-surface-raised-base-hover px-2 py-2"
        >
          <div className="flex items-center gap-2.5">
            <ProviderMark id={model.providerID} />
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={onEditKeyDown}
              onBlur={save}
              placeholder="Name it, e.g. Tutor"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-strong outline-none placeholder:text-text-weaker"
            />
            <span className="shrink-0 text-[11px] text-text-weaker">
              {model.name} · {model.providerName}
            </span>
          </div>
          <p className="pl-6.5 text-[11px] text-text-weaker">
            {clashModel
              ? `“${draft.trim()}” already names ${clashModel.name} · ${clashModel.providerName}`
              : "Enter saves · leave it empty to remove the name · Esc cancels"}
          </p>
        </div>
      )
    }
    return (
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
        <ProviderMark id={model.providerID} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] text-text-strong">
            <Highlight text={alias ?? model.name} query={query} />
          </span>
          <span className="truncate text-[11px] text-text-weaker">
            {alias ? (
              <>
                <Highlight text={model.name} query={query} />
                {" · "}
              </>
            ) : null}
            <Highlight text={model.providerName} query={query} />
          </span>
        </span>
        {model.key === choice.model.key ? (
          <CheckIcon className="size-3.5 shrink-0 text-text-interactive-base" />
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            startEditing(model.key)
          }}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] text-text-weaker opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100 hover:text-text-strong"
        >
          <PencilIcon className="size-3" />
          {alias ? "Rename" : "Name it"}
        </button>
      </div>
    )
  }

  const panel = (
    <MenuSurface className="w-[26rem]">
      <SearchField
        value={query}
        onChange={setQuery}
        onKeyDown={nav.onKeyDown}
        placeholder="Search your names or model names…"
      />
      <div ref={nav.listRef} className="max-h-80 overflow-y-auto p-1">
        {flat.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-weaker">
            Nothing is called “{query}”
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
    </MenuSurface>
  )

  return <MockComposer open={choice.open} panel={panel} trigger={trigger} />
}
