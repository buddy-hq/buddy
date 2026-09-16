import { useEffect, useMemo, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@buddy/ui"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@buddy/ui/components/ui/input-group"
import { language } from "@/context/language"
import { useTheme, type ColorScheme } from "@/theme"
import {
  CODE_FONT_PLACEHOLDER,
  MAX_APPEARANCE_FONT_SIZE,
  MAX_CHAT_LINE_HEIGHT_PERCENT,
  MIN_APPEARANCE_FONT_SIZE,
  MIN_CHAT_LINE_HEIGHT_PERCENT,
  UI_FONT_PLACEHOLDER,
  codeFontFamily,
  isChatLineSpacing,
  uiFallbackFontFamily,
  uiFontFamily,
  useAppearancePreferences,
  type ChatLineSpacing,
} from "@/state/appearance-preferences"
import { FontFamilyPicker, useInstalledFontFamilies } from "./settings-font-family-picker"
import { SettingsContent, SettingsSection, SettingsRow } from "./settings-primitives"

const APPEARANCE_CONTROL_CLASS = "w-56"
const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 19, 20]
const CUSTOM_FONT_SIZE = "custom"

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

function FontFamilyField(props: {
  value: string
  defaultLabel: string
  monospace?: boolean
  ariaLabel: string
  dataAction: string
  fontFamily: (family: string) => string
  onChange: (value: string) => void
}) {
  const installedFonts = useInstalledFontFamilies()

  if (installedFonts.status !== "unavailable") {
    return (
      <FontFamilyPicker
        {...props}
        families={installedFonts.status === "available" ? installedFonts.families : []}
        disabled={installedFonts.status === "loading"}
        className={APPEARANCE_CONTROL_CLASS}
      />
    )
  }

  return (
    <InputGroup className={APPEARANCE_CONTROL_CLASS}>
      <InputGroupInput
        data-action={props.dataAction}
        value={props.value}
        placeholder={props.defaultLabel}
        aria-label={props.ariaLabel}
        spellCheck={false}
        autoCorrect="off"
        autoComplete="off"
        autoCapitalize="off"
        className="pl-2.5"
        style={{ fontFamily: props.fontFamily(props.value) }}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </InputGroup>
  )
}

export function SettingsNumberInput(props: {
  value: number
  min: number
  max: number
  step: number | "any"
  unit: string
  ariaLabel: string
  dataAction: string
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(props.value))

  useEffect(() => {
    setDraft(String(props.value))
  }, [props.value])

  return (
    <InputGroup className={APPEARANCE_CONTROL_CLASS}>
      <InputGroupInput
        data-action={props.dataAction}
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={draft}
        aria-label={props.ariaLabel}
        className="pl-2.5 tabular-nums"
        onChange={(event) => {
          const nextDraft = event.currentTarget.value
          setDraft(nextDraft)
          const value = Number(nextDraft)
          if (Number.isFinite(value) && value >= props.min && value <= props.max) {
            props.onChange(value)
          }
        }}
        onBlur={() => setDraft(String(props.value))}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{props.unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

function FontSizeRows(props: {
  value: number
  ariaLabel: string
  dataAction: string
  onChange: (value: number) => void
}) {
  const [customChosen, setCustomChosen] = useState(false)
  const custom = customChosen || !FONT_SIZE_OPTIONS.includes(props.value)

  return (
    <>
      <SettingsRow
        title={language.t("settings.appearance.fontSizeTitle")}
        control={
          <Select
            value={custom ? CUSTOM_FONT_SIZE : String(props.value)}
            onValueChange={(value) => {
              setCustomChosen(value === CUSTOM_FONT_SIZE)
              if (value !== CUSTOM_FONT_SIZE) props.onChange(Number(value))
            }}
          >
            <SelectTrigger
              data-action={props.dataAction}
              aria-label={props.ariaLabel}
              className={APPEARANCE_CONTROL_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {language.t("settings.appearance.fontSizeOption", { size })}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_FONT_SIZE}>
                {language.t("settings.appearance.fontSizeCustomOption")}
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />
      {custom ? (
        <SettingsRow
          title={language.t("settings.appearance.customFontSizeTitle")}
          control={
            <SettingsNumberInput
              dataAction={`${props.dataAction}-custom`}
              value={props.value}
              min={MIN_APPEARANCE_FONT_SIZE}
              max={MAX_APPEARANCE_FONT_SIZE}
              step="any"
              unit="px"
              ariaLabel={language.t("settings.appearance.customFontSizeAria", {
                label: props.ariaLabel,
              })}
              onChange={props.onChange}
            />
          }
        />
      ) : null}
    </>
  )
}

export function AppearanceSettings() {
  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()
  const uiFont = useAppearancePreferences((state) => state.uiFont)
  const codeFont = useAppearancePreferences((state) => state.codeFont)
  const chatFont = useAppearancePreferences((state) => state.chatFont)
  const documentFont = useAppearancePreferences((state) => state.documentFont)
  const uiFontSize = useAppearancePreferences((state) => state.uiFontSize)
  const codeFontSize = useAppearancePreferences((state) => state.codeFontSize)
  const chatFontSize = useAppearancePreferences((state) => state.chatFontSize)
  const documentFontSize = useAppearancePreferences((state) => state.documentFontSize)
  const chatLineSpacing = useAppearancePreferences((state) => state.chatLineSpacing)
  const setUiFont = useAppearancePreferences((state) => state.setUiFont)
  const setCodeFont = useAppearancePreferences((state) => state.setCodeFont)
  const setChatFont = useAppearancePreferences((state) => state.setChatFont)
  const setDocumentFont = useAppearancePreferences((state) => state.setDocumentFont)
  const setUiFontSize = useAppearancePreferences((state) => state.setUiFontSize)
  const setCodeFontSize = useAppearancePreferences((state) => state.setCodeFontSize)
  const setChatFontSize = useAppearancePreferences((state) => state.setChatFontSize)
  const setDocumentFontSize = useAppearancePreferences((state) => state.setDocumentFontSize)
  const chatLineHeightPercent = useAppearancePreferences((state) => state.chatLineHeightPercent)
  const setChatLineSpacing = useAppearancePreferences((state) => state.setChatLineSpacing)
  const setChatLineHeightPercent = useAppearancePreferences(
    (state) => state.setChatLineHeightPercent,
  )

  const colorSchemeOptions: ReadonlyArray<{ value: ColorScheme; label: string }> = [
    { value: "system", label: language.t("settings.appearance.colorSchemes.system") },
    { value: "light", label: language.t("settings.appearance.colorSchemes.light") },
    { value: "dark", label: language.t("settings.appearance.colorSchemes.dark") },
  ]

  const chatLineSpacingOptions: ReadonlyArray<{ value: ChatLineSpacing; label: string }> = [
    { value: "compact", label: language.t("settings.appearance.chatLineSpacingCompactOption") },
    { value: "normal", label: language.t("settings.appearance.chatLineSpacingNormalOption") },
    { value: "relaxed", label: language.t("settings.appearance.chatLineSpacingRelaxedOption") },
    { value: "custom", label: language.t("settings.appearance.chatLineSpacingCustomOption") },
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
      <SettingsSection title={language.t("settings.appearance.colorsSection")}>
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
              <SelectTrigger
                data-action="settings-color-scheme"
                className={APPEARANCE_CONTROL_CLASS}
              >
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
              <SelectTrigger data-action="settings-theme" className={APPEARANCE_CONTROL_CLASS}>
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
      </SettingsSection>
      <SettingsSection title={language.t("settings.appearance.interfaceSection")}>
        <SettingsRow
          title={language.t("settings.appearance.fontTitle")}
          control={
            <FontFamilyField
              dataAction="settings-ui-font"
              value={uiFont}
              defaultLabel={UI_FONT_PLACEHOLDER}
              ariaLabel={language.t("settings.appearance.uiFontAria")}
              fontFamily={uiFontFamily}
              onChange={setUiFont}
            />
          }
        />
        <FontSizeRows
          dataAction="settings-ui-font-size"
          value={uiFontSize}
          ariaLabel={language.t("settings.appearance.uiFontSizeAria")}
          onChange={setUiFontSize}
        />
      </SettingsSection>
      <SettingsSection title={language.t("settings.appearance.chatSection")}>
        <SettingsRow
          title={language.t("settings.appearance.fontTitle")}
          control={
            <FontFamilyField
              dataAction="settings-chat-font"
              value={chatFont}
              defaultLabel={uiFont || UI_FONT_PLACEHOLDER}
              ariaLabel={language.t("settings.appearance.chatFontAria")}
              fontFamily={(family) => uiFallbackFontFamily(family, uiFont)}
              onChange={setChatFont}
            />
          }
        />
        <FontSizeRows
          dataAction="settings-chat-font-size"
          value={chatFontSize}
          ariaLabel={language.t("settings.appearance.chatFontSizeAria")}
          onChange={setChatFontSize}
        />
        <SettingsRow
          title={language.t("settings.appearance.lineSpacingTitle")}
          control={
            <Select
              value={chatLineSpacing}
              onValueChange={(value) => {
                if (isChatLineSpacing(value)) {
                  setChatLineSpacing(value)
                }
              }}
            >
              <SelectTrigger
                data-action="settings-chat-line-spacing"
                className={APPEARANCE_CONTROL_CLASS}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chatLineSpacingOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        {chatLineSpacing === "custom" ? (
          <SettingsRow
            title={language.t("settings.appearance.lineHeightTitle")}
            control={
              <SettingsNumberInput
                dataAction="settings-chat-line-height"
                value={chatLineHeightPercent}
                min={MIN_CHAT_LINE_HEIGHT_PERCENT}
                max={MAX_CHAT_LINE_HEIGHT_PERCENT}
                step={1}
                unit="%"
                ariaLabel={language.t("settings.appearance.chatLineHeightAria")}
                onChange={setChatLineHeightPercent}
              />
            }
          />
        ) : null}
      </SettingsSection>
      <SettingsSection title={language.t("settings.appearance.documentsSection")}>
        <SettingsRow
          title={language.t("settings.appearance.fontTitle")}
          control={
            <FontFamilyField
              dataAction="settings-document-font"
              value={documentFont}
              defaultLabel={uiFont || UI_FONT_PLACEHOLDER}
              ariaLabel={language.t("settings.appearance.documentFontAria")}
              fontFamily={(family) => uiFallbackFontFamily(family, uiFont)}
              onChange={setDocumentFont}
            />
          }
        />
        <FontSizeRows
          dataAction="settings-document-font-size"
          value={documentFontSize}
          ariaLabel={language.t("settings.appearance.documentFontSizeAria")}
          onChange={setDocumentFontSize}
        />
      </SettingsSection>
      <SettingsSection title={language.t("settings.appearance.codeSection")}>
        <SettingsRow
          title={language.t("settings.appearance.fontTitle")}
          control={
            <FontFamilyField
              dataAction="settings-code-font"
              value={codeFont}
              defaultLabel={CODE_FONT_PLACEHOLDER}
              monospace
              ariaLabel={language.t("settings.appearance.codeFontAria")}
              fontFamily={codeFontFamily}
              onChange={setCodeFont}
            />
          }
        />
        <FontSizeRows
          dataAction="settings-code-font-size"
          value={codeFontSize}
          ariaLabel={language.t("settings.appearance.codeFontSizeAria")}
          onChange={setCodeFontSize}
        />
      </SettingsSection>
    </SettingsContent>
  )
}
