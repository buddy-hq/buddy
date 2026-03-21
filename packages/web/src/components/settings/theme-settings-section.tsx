import { useMemo } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@buddy/ui"
import { useTheme, type ColorScheme } from "@/theme"
import { SettingsRow } from "./settings-primitives"

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

export function ThemeSettingsSection() {
  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()

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

  return (
    <>
      <SettingsRow
        title="Color scheme"
        description="Choose how Buddy should render on this machine. System follows your OS setting."
        control={
          <Select value={colorScheme} onValueChange={(value) => isColorScheme(value) && setColorScheme(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select color scheme" />
            </SelectTrigger>
            <SelectContent>
              {colorSchemeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <SettingsRow
        title="Theme"
        description="Choose your preferred theme for the interface."
        control={
          <Select value={themeId} onValueChange={setTheme}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              {themeOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </>
  )
}
