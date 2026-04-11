import { useMemo, useState } from "react"
import { Input } from "@buddy/ui"

type ColorToken = {
  name: string
  token: string
  value: string
}

function getColorTokens(): ColorToken[] {
  if (typeof document === "undefined") return []

  const computedStyle = getComputedStyle(document.documentElement)
  const tokens: ColorToken[] = []

  const colorTokenRegex = /^--color-/

  for (const property of computedStyle) {
    if (colorTokenRegex.test(property)) {
      const value = computedStyle.getPropertyValue(property).trim()
      if (value && value !== "initial") {
        tokens.push({
          name: property.replace("--color-", "").replace(/-/g, " "),
          token: property,
          value,
        })
      }
    }
  }

  return tokens.toSorted((a, b) => a.name.localeCompare(b.name))
}

function ColorSwatch({ token }: { token: ColorToken }) {
  return (
    <div className="group relative flex items-center gap-3 rounded-md border border-border-base/50 p-2 hover:bg-surface-weak/50">
      <div
        className="size-10 shrink-0 rounded-md border border-border-base/30 shadow-sm"
        style={{ backgroundColor: token.value }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-text-base">{token.name}</p>
        <p className="truncate text-[10px] text-text-weak font-mono">{token.token}</p>
        <p className="truncate text-[10px] text-text-weaker font-mono">{token.value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(token.value)
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <span className="sr-only">Copy</span>
        <svg
          className="size-3.5 text-text-weak hover:text-text-base"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
    </div>
  )
}

type PalettePanelProps = {
  className?: string
}

export function PalettePanel({ className }: PalettePanelProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const tokens = useMemo(() => getColorTokens(), [])

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens
    const query = searchQuery.toLowerCase()
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.token.toLowerCase().includes(query) ||
        t.value.toLowerCase().includes(query),
    )
  }, [tokens, searchQuery])

  const groupedTokens = useMemo(() => {
    const groups = new Map<string, ColorToken[]>()
    for (const token of filteredTokens) {
      const category = token.name.split(" ")[0]
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(token)
    }
    return groups
  }, [filteredTokens])

  return (
    <div className={`flex h-full min-h-0 flex-col gap-3 p-3 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-weak leading-none">
            Theme Palette
          </p>
          <p className="text-xs text-text-weak line-clamp-2">
            {tokens.length} color tokens from theme-tokens.css
          </p>
        </div>
      </div>

      <Input
        placeholder="Search colors..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-8 text-xs"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {Array.from(groupedTokens.entries()).map(([category, categoryTokens]) => (
          <div key={category} className="mb-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-weaker">
              {category}
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {categoryTokens.map((token) => (
                <ColorSwatch key={token.token} token={token} />
              ))}
            </div>
          </div>
        ))}
        {filteredTokens.length === 0 && (
          <p className="text-sm text-text-weak">No colors match your search.</p>
        )}
      </div>
    </div>
  )
}
