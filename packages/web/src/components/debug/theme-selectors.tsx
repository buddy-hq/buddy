import { useMemo } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@buddy/ui"
import { useTheme, type ColorScheme } from "@/theme"

type ThemeSelectorsProps = {
  className?: string
  compact?: boolean
}

const COLOR_SCHEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] satisfies { value: ColorScheme; label: string }[]

const DEVTOOLS_SELECT_CONTENT_CLASS = "z-[10000]"

function isColorScheme(value: string): value is ColorScheme {
  return COLOR_SCHEME_OPTIONS.some((option) => option.value === value)
}

export function ThemeSelectors({ className, compact = false }: ThemeSelectorsProps) {
  const { colorScheme, themeId, themes, setColorScheme, setTheme } = useTheme()
  const themeOptions = useMemo(
    () =>
      Object.entries(themes).map(([id, theme]) => ({
        id,
        name: theme.name,
      })),
    [themes],
  )

  return (
    <div
      className={cn(
        compact ? "flex items-center gap-2" : "grid grid-cols-2 gap-2",
        className,
      )}
    >
      <Select
        value={colorScheme}
        onValueChange={(value) => {
          if (isColorScheme(value)) setColorScheme(value)
        }}
      >
        <SelectTrigger
          size={compact ? "sm" : "default"}
          aria-label="Color scheme"
          className={cn("text-xs", compact ? "w-24" : "w-full")}
        >
          <SelectValue placeholder="Color scheme" />
        </SelectTrigger>
        <SelectContent className={DEVTOOLS_SELECT_CONTENT_CLASS}>
          {COLOR_SCHEME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={themeId} onValueChange={setTheme}>
        <SelectTrigger
          size={compact ? "sm" : "default"}
          aria-label="Theme"
          className={cn("text-xs", compact ? "w-36" : "w-full")}
        >
          <SelectValue placeholder="Theme" />
        </SelectTrigger>
        <SelectContent className={DEVTOOLS_SELECT_CONTENT_CLASS}>
          {themeOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
