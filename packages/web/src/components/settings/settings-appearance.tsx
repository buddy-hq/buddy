import { useEffect, useMemo, useState } from "react"
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import { language } from "@/context/language"
import { useTheme, type ColorScheme } from "@/theme"
import {
  CODE_FONT_PLACEHOLDER,
  MAX_APPEARANCE_FONT_SIZE,
  MIN_APPEARANCE_FONT_SIZE,
  UI_FONT_PLACEHOLDER,
  codeFontFamily,
  uiFontFamily,
  useAppearancePreferences,
} from "@/state/appearance-preferences"
import { SettingsContent, SettingsSection, SettingsRow } from "./settings-primitives"

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

function FontTextInput(props: {
  value: string
  placeholder: string
  ariaLabel: string
  dataAction: string
  fontFamily: string
  onChange: (value: string) => void
}) {
  return (
    <Input
      data-action={props.dataAction}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      spellCheck={false}
      autoCorrect="off"
      autoComplete="off"
      autoCapitalize="off"
      className="h-8 text-xs"
      style={{ fontFamily: props.fontFamily }}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  )
}

export function FontSizeInput(props: {
  value: number
  ariaLabel: string
  dataAction: string
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(props.value))

  useEffect(() => {
    setDraft(String(props.value))
  }, [props.value])

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        data-action={props.dataAction}
        type="number"
        min={MIN_APPEARANCE_FONT_SIZE}
        max={MAX_APPEARANCE_FONT_SIZE}
        step={1}
        value={draft}
        aria-label={props.ariaLabel}
        className="h-8 w-20 text-right text-xs tabular-nums"
        onChange={(event) => {
          const nextDraft = event.currentTarget.value
          setDraft(nextDraft)
          const value = Number(nextDraft)
          if (
            Number.isInteger(value) &&
            value >= MIN_APPEARANCE_FONT_SIZE &&
            value <= MAX_APPEARANCE_FONT_SIZE
          ) {
            props.onChange(value)
          }
        }}
        onBlur={() => setDraft(String(props.value))}
      />
      <span className="w-5 text-xs text-text-weak">px</span>
    </div>
  )
}

export function AppearanceSettings() {
  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()
  const uiFont = useAppearancePreferences((state) => state.uiFont)
  const codeFont = useAppearancePreferences((state) => state.codeFont)
  const uiFontSize = useAppearancePreferences((state) => state.uiFontSize)
  const codeFontSize = useAppearancePreferences((state) => state.codeFontSize)
  const setUiFont = useAppearancePreferences((state) => state.setUiFont)
  const setCodeFont = useAppearancePreferences((state) => state.setCodeFont)
  const setUiFontSize = useAppearancePreferences((state) => state.setUiFontSize)
  const setCodeFontSize = useAppearancePreferences((state) => state.setCodeFontSize)

  const colorSchemeOptions: ReadonlyArray<{ value: ColorScheme; label: string }> = [
    { value: "system", label: language.t("settings.appearance.colorSchemes.system") },
    { value: "light", label: language.t("settings.appearance.colorSchemes.light") },
    { value: "dark", label: language.t("settings.appearance.colorSchemes.dark") },
  ]

  const themeOptions = useMemo(
    () =>
      Object.entries(themes).map(([id, theme]) => ({
        id,
        name: theme.name,
      })),
    [themes],
  )

  return (
    <SettingsContent>
        <SettingsSection title={language.t("settings.general.appearanceSection")}>
          <SettingsRow
            title={language.t("settings.appearance.colorSchemeTitle")}
            control={
              <Select
                value={colorScheme}
                onValueChange={(value) => {
                  if (isColorScheme(value)) {
                    setColorScheme(value)
                  }
                }}
              >
                <SelectTrigger data-action="settings-color-scheme" className="w-full">
                  <SelectValue
                    placeholder={language.t("settings.appearance.colorSchemePlaceholder")}
                  />
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
            title={language.t("settings.appearance.themeTitle")}
            control={
              <Select value={themeId} onValueChange={setTheme}>
                <SelectTrigger data-action="settings-theme" className="w-full">
                  <SelectValue placeholder={language.t("settings.appearance.themePlaceholder")} />
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
          <SettingsRow
            title={language.t("settings.general.uiFontTitle")}
            control={
              <FontTextInput
                dataAction="settings-ui-font"
                value={uiFont}
                placeholder={UI_FONT_PLACEHOLDER}
                ariaLabel={language.t("settings.general.uiFontAria")}
                fontFamily={uiFontFamily(uiFont)}
                onChange={setUiFont}
              />
            }
          />
          <SettingsRow
            title={language.t("settings.general.codeFontTitle")}
            control={
              <FontTextInput
                dataAction="settings-code-font"
                value={codeFont}
                placeholder={CODE_FONT_PLACEHOLDER}
                ariaLabel={language.t("settings.general.codeFontAria")}
                fontFamily={codeFontFamily(codeFont)}
                onChange={setCodeFont}
              />
            }
          />
          <SettingsRow
            title={language.t("settings.general.uiFontSizeTitle")}
            control={
              <FontSizeInput
                dataAction="settings-ui-font-size"
                value={uiFontSize}
                ariaLabel={language.t("settings.general.uiFontSizeAria")}
                onChange={setUiFontSize}
              />
            }
          />
          <SettingsRow
            title={language.t("settings.general.codeFontSizeTitle")}
            control={
              <FontSizeInput
                dataAction="settings-code-font-size"
                value={codeFontSize}
                ariaLabel={language.t("settings.general.codeFontSizeAria")}
                onChange={setCodeFontSize}
              />
            }
          />
        </SettingsSection>

    </SettingsContent>
  )
}
