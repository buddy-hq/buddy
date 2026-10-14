import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { cn } from "@buddy/ui"
import { MODELS, isAmbiguousName, searchModels, type ModelEntry } from "./catalog"
import { Kbd, MockComposer, ProviderMark, useModelChoice } from "./shared"

export function GhostAutocompleteVariant() {
  const choice = useModelChoice()
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const matches = useMemo(() => searchModels(MODELS, query).slice(0, 4), [query])
  useEffect(() => setCursor(0), [query])
  const candidate: ModelEntry | undefined = query.trim() ? matches[cursor] : undefined
  const completes = !!candidate && candidate.name.toLowerCase().startsWith(query.toLowerCase())
  const shown = candidate ?? choice.model
  const pick = (model: ModelEntry) => {
    choice.pick(model.key)
    setQuery("")
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") return setQuery("")
    if (!candidate) return
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault()
      pick(candidate)
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setCursor((cursor + step + matches.length) % matches.length)
    }
  }

  const trigger = (
    <label
      className={cn(
        "inline-flex h-7 w-[300px] min-w-0 items-center gap-1.5 rounded-md px-2 text-xs",
        query ? "bg-surface-raised-base-hover" : "hover:bg-surface-raised-base-hover",
      )}
    >
      <ProviderMark id={shown.providerID} className="size-3.5" />
      <span className="relative min-w-0 flex-1">
        {/* The typed text is mirrored invisibly so the ghost completion starts exactly where it ends. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-text-weaker"
        >
          <span className="invisible">{query}</span>
          {candidate
            ? completes
              ? candidate.name.slice(query.length)
              : `  → ${candidate.name}`
            : null}
          {candidate && isAmbiguousName(candidate) ? ` · ${candidate.providerName}` : null}
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={`${choice.model.name} · ${choice.model.providerName}`}
          className="relative w-full bg-transparent text-text-strong outline-none placeholder:text-text-weak"
        />
      </span>
      {candidate ? <Kbd>tab</Kbd> : null}
    </label>
  )

  const panel = (
    <div className="flex h-7 w-[34rem] max-w-full items-center gap-1 overflow-hidden px-1 text-[11px] text-text-weaker">
      {!query.trim() ? <span>Click the model name and type. Tab takes the suggestion.</span> : null}
      {query.trim() && matches.length === 0 ? <span>No model matches “{query}”</span> : null}
      {query.trim()
        ? matches.map((model, index) => (
            <button
              key={model.key}
              type="button"
              onMouseEnter={() => setCursor(index)}
              onClick={() => pick(model)}
              className={cn(
                "inline-flex h-6 min-w-0 items-center gap-1 rounded-full px-2 hover:text-text-strong",
                index === cursor && "bg-surface-raised-base-hover text-text-strong",
              )}
            >
              <ProviderMark id={model.providerID} className="size-3" />
              <span className="truncate">{model.name}</span>
              {isAmbiguousName(model) ? (
                <span className="shrink-0 opacity-70">· {model.providerName}</span>
              ) : null}
            </button>
          ))
        : null}
    </div>
  )

  return <MockComposer open panel={panel} trigger={trigger} />
}
