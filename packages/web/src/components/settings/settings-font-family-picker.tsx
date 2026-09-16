import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  cn,
} from "@buddy/ui"
import { ComboboxEmpty, ComboboxInput } from "@buddy/ui/components/ui/combobox"
import { InputGroupAddon } from "@buddy/ui/components/ui/input-group"
import { VIRTUAL_DEFAULT_OVERSCAN } from "@/components/virtualization/virtualization-defaults"
import { language } from "@/context/language"
import { SearchIcon } from "@/icons/app-icons"
import { uiFontFamily } from "@/state/appearance-preferences"
import { browserDocument, browserWindow } from "@/state/parse-external"

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<ReadonlyArray<{ family: string }>>
  }
}

const DEFAULT_FONT_ITEM = "__default__"
const FONT_ROW_ESTIMATE_PX = 28
const MONOSPACE_PROBE_GLYPHS = ["i", "W", "m", "."]
const FONT_PICKER_TRIGGER_CLASS =
  "border-border-base bg-input-base hover:bg-input-hover focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 flex h-8 items-center justify-between gap-1.5 rounded-lg border py-2 pr-2 pl-2.5 text-sm whitespace-nowrap outline-none transition-colors select-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"

type InstalledFontFamilies =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "available"; families: string[] }

const monospaceFamilies = new Map<string, boolean>()
let monospaceProbeContext: CanvasRenderingContext2D | null | undefined

async function listInstalledFontFamilies(): Promise<string[]> {
  const fonts = (await browserWindow()?.queryLocalFonts?.()) ?? []
  return [...new Set(fonts.map((font) => font.family))]
    .filter((family) => !family.startsWith("."))
    .toSorted((left, right) => left.localeCompare(right))
}

export function useInstalledFontFamilies(): InstalledFontFamilies {
  const supported = browserWindow()?.queryLocalFonts !== undefined
  const query = useQuery({
    queryKey: ["installed-font-families"],
    queryFn: listInstalledFontFamilies,
    enabled: supported,
    staleTime: Infinity,
    retry: false,
  })
  if (!supported || query.isError || query.data?.length === 0) return { status: "unavailable" }
  if (!query.isSuccess) return { status: "loading" }
  return { status: "available", families: query.data }
}

function isMonospaceFontFamily(family: string): boolean {
  const cached = monospaceFamilies.get(family)
  if (cached !== undefined) return cached

  monospaceProbeContext ??= browserDocument()?.createElement("canvas").getContext("2d") ?? null
  const context = monospaceProbeContext
  if (!context) return true

  context.font = `32px ${uiFontFamily(family)}`
  const widths = new Set(
    MONOSPACE_PROBE_GLYPHS.map((glyph) => Math.round(context.measureText(glyph).width)),
  )
  const monospace = widths.size === 1
  monospaceFamilies.set(family, monospace)
  return monospace
}

export function FontFamilyPicker(props: {
  value: string
  defaultLabel: string
  families: string[]
  monospace?: boolean
  disabled?: boolean
  ariaLabel: string
  dataAction: string
  className?: string
  fontFamily: (family: string) => string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const revealSelectedRef = useRef(false)

  const families = useMemo(() => {
    if (!props.monospace) return props.families
    return open ? props.families.filter(isMonospaceFontFamily) : []
  }, [open, props.families, props.monospace])

  const items = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return [DEFAULT_FONT_ITEM, ...families]
    return families.filter((family) => family.toLowerCase().includes(query))
  }, [families, search])

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => FONT_ROW_ESTIMATE_PX,
    getItemKey: (index) => items[index] ?? index,
    overscan: VIRTUAL_DEFAULT_OVERSCAN,
  })

  useEffect(() => {
    if (!scrollElement || !revealSelectedRef.current) return
    revealSelectedRef.current = false
    const selectedIndex = items.indexOf(props.value || DEFAULT_FONT_ITEM)
    if (selectedIndex > 0) virtualizer.scrollToIndex(selectedIndex, { align: "center" })
  }, [items, props.value, scrollElement, virtualizer])

  return (
    <Combobox
      items={items}
      filteredItems={items}
      virtualized
      autoHighlight
      disabled={props.disabled}
      inputValue={search}
      onInputValueChange={(value) => {
        setSearch(value)
        virtualizer.scrollToOffset(0)
      }}
      onOpenChange={(nextOpen) => {
        revealSelectedRef.current = nextOpen
        setOpen(nextOpen)
        setSearch("")
      }}
      value={props.value || DEFAULT_FONT_ITEM}
      onValueChange={(value) => {
        if (value === null) return
        props.onChange(value === DEFAULT_FONT_ITEM ? "" : value)
      }}
      onItemHighlighted={(_item, details) => {
        if (details.reason === "keyboard") virtualizer.scrollToIndex(details.index)
      }}
    >
      <ComboboxTrigger
        data-action={props.dataAction}
        aria-label={props.ariaLabel}
        className={cn(FONT_PICKER_TRIGGER_CLASS, props.className)}
      >
        <span className="min-w-0 truncate" style={{ fontFamily: props.fontFamily(props.value) }}>
          {props.value || props.defaultLabel}
        </span>
      </ComboboxTrigger>
      <ComboboxContent align="end" className="w-72">
        <ComboboxInput
          showTrigger={false}
          placeholder={language.t("settings.appearance.fontSearchPlaceholder")}
        >
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxEmpty>{language.t("settings.appearance.fontSearchEmpty")}</ComboboxEmpty>
        <ComboboxList className="max-h-none overflow-hidden">
          <div
            ref={setScrollElement}
            className="max-h-[min(--spacing(60),calc(var(--available-height)---spacing(11)))] overflow-y-auto overscroll-contain"
          >
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => {
                const item = items[row.index]
                if (item === undefined) return null
                const isDefault = item === DEFAULT_FONT_ITEM

                return (
                  <div
                    key={row.key}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${row.start}px)` }}
                  >
                    <ComboboxItem index={row.index} value={item}>
                      <span
                        className="min-w-0 truncate"
                        style={{ fontFamily: props.fontFamily(isDefault ? "" : item) }}
                      >
                        {isDefault ? props.defaultLabel : item}
                      </span>
                      {isDefault ? (
                        <span className="ml-auto shrink-0 text-xs text-text-weaker">
                          {language.t("settings.appearance.fontDefaultBadge")}
                        </span>
                      ) : null}
                    </ComboboxItem>
                  </div>
                )
              })}
            </div>
          </div>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
