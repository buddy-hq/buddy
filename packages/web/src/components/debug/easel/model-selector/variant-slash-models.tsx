import { useState, type KeyboardEvent } from "react"
import { XIcon } from "@buddy/ui"
import { DEFAULT_ALIASES, MODELS, PINNED_KEYS, isAmbiguousName, type ModelEntry } from "./catalog"
import {
  Highlight,
  Kbd,
  MenuSurface,
  MockComposer,
  ModelTrigger,
  ProviderMark,
  useListKeyboard,
  useModelChoice,
} from "./shared"

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "")
}

function rank(model: ModelEntry) {
  if (DEFAULT_ALIASES.has(model.key)) return 2
  return PINNED_KEYS.includes(model.key) ? 1 : 0
}

/** Your names become commands; other models get a slug, plus the provider when the name is shared. */
const COMMANDS = MODELS.map((model) => {
  const alias = DEFAULT_ALIASES.get(model.key)
  const provider = model.providerID.replace("github-", "")
  const command = alias
    ? slug(alias)
    : isAmbiguousName(model)
      ? `${slug(model.name)}-${provider}`
      : slug(model.name)
  return { model, command, alias }
}).toSorted((a, b) => rank(b.model) - rank(a.model))

function labelFor(model: ModelEntry) {
  const alias = DEFAULT_ALIASES.get(model.key)
  if (alias) return alias
  return isAmbiguousName(model) ? `${model.name} · ${model.providerName}` : model.name
}

export function SlashModelsVariant() {
  const choice = useModelChoice()
  const [text, setText] = useState("")
  const [override, setOverride] = useState<ModelEntry>()
  const [sent, setSent] = useState<string>()
  const match = /(^|\s)\/([\w.-]*)$/.exec(text)
  const query = match?.[2]?.toLowerCase() ?? ""
  const options = match
    ? COMMANDS.filter(
        (entry) =>
          entry.command.includes(query) ||
          entry.model.name.toLowerCase().includes(query) ||
          entry.model.providerName.toLowerCase().includes(query),
      )
        .toSorted(
          (a, b) => Number(b.command.startsWith(query)) - Number(a.command.startsWith(query)),
        )
        .slice(0, 8)
    : []
  const menuOpen = options.length > 0
  const choose = (index: number) => {
    const entry = options[index]
    if (!entry || !match) return
    setOverride(entry.model)
    setText(text.slice(0, match.index + match[1].length))
  }
  const nav = useListKeyboard({ count: options.length, resetKey: query, onPick: choose })

  const onPromptKeyDown = (event: KeyboardEvent) => {
    if (menuOpen) {
      if (event.key === "Tab") {
        event.preventDefault()
        choose(nav.activeIndex)
        return
      }
      nav.onKeyDown(event)
      return
    }
    if (event.key === "Enter" && text.trim()) {
      event.preventDefault()
      setSent(
        `Sent with ${labelFor(override ?? choice.model)}. The next message goes back to ${labelFor(choice.model)}.`,
      )
      setText("")
      setOverride(undefined)
    }
  }

  const panel = (
    <MenuSurface className="w-[26rem]">
      <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-text-weaker">
        Use a model for this message
      </div>
      <div ref={nav.listRef} className="max-h-72 overflow-y-auto p-1">
        {options.map((entry, index) => (
          <button
            key={entry.model.key}
            type="button"
            data-nav-index={index}
            data-active={index === nav.activeIndex}
            onMouseMove={() => nav.setActiveIndex(index)}
            onClick={() => choose(index)}
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left data-[active=true]:bg-surface-raised-base-hover"
          >
            <ProviderMark id={entry.model.providerID} />
            <span className="shrink-0 text-[13px] text-text-strong">
              /<Highlight text={entry.command} query={query} />
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-[11px] text-text-weaker">
              {entry.alias ? `${entry.model.name} · ` : ""}
              {entry.model.providerName}
            </span>
          </button>
        ))}
      </div>
      <footer className="flex items-center gap-2 border-t border-border-weaker-base px-3 py-2 text-[11px] text-text-weaker">
        <Kbd>tab</Kbd> use for this message
        <span className="ml-auto">Your names come first</span>
      </footer>
    </MenuSurface>
  )

  const trigger = (
    <span className="flex min-w-0 items-center gap-1">
      <span className={override ? "min-w-0 opacity-40" : "min-w-0"}>
        <ModelTrigger model={choice.model} open={false} onClick={() => undefined} />
      </span>
      {override ? (
        <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-surface-interactive-weak px-2 text-xs text-text-interactive-base">
          <ProviderMark id={override.providerID} className="size-3.5" />
          <span className="truncate">This message: {labelFor(override)}</span>
          <button
            type="button"
            aria-label="Use the default model again"
            onClick={() => setOverride(undefined)}
            className="shrink-0 rounded-full hover:text-text-strong"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ) : null}
    </span>
  )

  return (
    <div className="flex flex-col gap-2">
      <MockComposer
        open={menuOpen}
        panel={panel}
        trigger={trigger}
        prompt={
          <input
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value)
              setSent(undefined)
            }}
            onKeyDown={onPromptKeyDown}
            placeholder="Type /tutor, /quick or /work to pick a model for one message…"
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-text-strong outline-none placeholder:text-text-weaker"
          />
        }
      />
      <p className="h-4 text-[11px] text-text-weaker">{sent}</p>
    </div>
  )
}
