import { useEffect, useMemo, useState } from "react"
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@buddy/ui"
import { useTheme, type ColorScheme } from "@/theme"

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
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(token.token).then(() => {
          toast.success(`Copied ${token.token}`)
        })
      }}
      className="group relative flex items-center gap-3 rounded-md border border-border-base/50 p-2 text-left hover:bg-surface-weak/50"
    >
      <div
        className="size-10 shrink-0 rounded-md border border-border-base/30 shadow-sm"
        style={{ backgroundColor: token.value }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-text-base">{token.name}</p>
        <p className="truncate text-[10px] text-text-weak font-mono">{token.token}</p>
        <p className="truncate text-[10px] text-text-weaker font-mono">{token.value}</p>
      </div>
    </button>
  )
}

type PalettePanelProps = {
  className?: string
}

export function PalettePanel({ className }: PalettePanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const { themeId, colorScheme, mode, themes, setTheme, setColorScheme } = useTheme()

  const [tokens, setTokens] = useState<ColorToken[]>(() => getColorTokens())

  useEffect(() => {
    // We need to wait for the DOM to update with the new CSS variables
    const raf = requestAnimationFrame(() => {
      setTokens(getColorTokens())
    })
    return () => cancelAnimationFrame(raf)
  }, [themeId, mode])

  const colorSchemeOptions: { value: ColorScheme; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ]

  const themeOptions = useMemo(() => {
    return Object.entries(themes).map(([id, theme]) => ({
      id,
      name: theme.name,
    }))
  }, [themes])

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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-weak leading-none">
            Theme Palette
          </p>
          <p className="text-xs text-text-weak line-clamp-2">
            {tokens.length} color tokens from theme-tokens.css
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={colorScheme} onValueChange={(value) => setColorScheme(value as ColorScheme)}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="Color Scheme" />
          </SelectTrigger>
          <SelectContent className="z-[10000]">
            {colorSchemeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={themeId} onValueChange={setTheme}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent className="z-[10000]">
            {themeOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Input
        placeholder="Search colors..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-8 text-xs"
      />

      <div
        className="palette-container min-h-0 flex-1 overflow-y-auto"
        style={{ containerType: "inline-size" }}
      >
        <style>{`
          .palette-container { container-type: inline-size; }
          .palette-grid { grid-template-columns: repeat(1, 1fr); }
          @container (min-width: 420px) { .palette-grid { grid-template-columns: repeat(2, 1fr); } }
          @container (min-width: 640px) { .palette-grid { grid-template-columns: repeat(3, 1fr); } }
        `}</style>
        {Array.from(groupedTokens.entries()).map(([category, categoryTokens]) => (
          <div key={category} className="mb-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-weaker">
              {category}
            </p>
            <div className="palette-grid grid gap-1.5">
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
