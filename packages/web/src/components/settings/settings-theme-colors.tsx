import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import { language } from "@/context/language"
import { MoonIcon, SunIcon } from "@/icons/app-icons"
import {
  isColorScheme,
  selectableThemeIDs,
  themeDocumentColors,
  themeTokens,
  useTheme,
  type ColorScheme,
  type ThemeMode,
} from "@/theme"
import type { ResolvedTheme } from "@/theme/types"
import { SettingsRow, SettingsSection } from "./settings-primitives"

const TOKEN_REFERENCE_PATTERN = /^var\(--([a-z0-9-]+)\)$/u
const MAX_TOKEN_REFERENCE_DEPTH = 4
const SAMPLE_CODE = {
  keyword: "const",
  variable: "cube",
  operator: "=",
  string: '"n × n × n"',
  comment: "// 27",
} as const

const MODE_ICON = { light: SunIcon, dark: MoonIcon } satisfies Record<ThemeMode, typeof SunIcon>
const MODE_LABEL_KEY = {
  light: "settings.appearance.colorSchemes.light",
  dark: "settings.appearance.colorSchemes.dark",
} satisfies Record<ThemeMode, string>

function tokenColor(tokens: ResolvedTheme, key: string): string | undefined {
  let value: string | undefined = tokens[key]
  for (let depth = 0; depth < MAX_TOKEN_REFERENCE_DEPTH; depth += 1) {
    const reference: string | undefined = value?.match(TOKEN_REFERENCE_PATTERN)?.[1]
    if (!reference) return value
    value = tokens[reference]
  }
  return value
}

function textColor(tokens: ResolvedTheme, key: string): string | undefined {
  return tokenColor(tokens, key) ?? tokenColor(tokens, "markdown-text")
}

function ThemeDots(props: { themeId: string; mode: ThemeMode }) {
  const colors = themeDocumentColors(props.themeId, props.mode)
  if (!colors) return null

  return (
    <span
      aria-hidden
      className="flex h-4 w-7 shrink-0 items-center justify-center gap-0.5 rounded-[5px] border border-border-base/60"
      style={{ backgroundColor: tokenColor(colors, "background-base") }}
    >
      {(["markdown-text", "markdown-heading", "syntax-string"] as const).map((key) => (
        <span
          key={key}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: textColor(colors, key) }}
        />
      ))}
    </span>
  )
}

function ThemeSelect(props: {
  mode: ThemeMode
  value: string
  themeIds: readonly string[]
  ariaLabel: string
  dataAction: string
  className: string
  footnote?: string
  onChange: (themeId: string) => void
}) {
  const { themes } = useTheme()

  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger
        data-action={props.dataAction}
        aria-label={props.ariaLabel}
        className={props.className}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.themeIds.map((themeId) => (
          <SelectItem key={themeId} value={themeId}>
            <span className="flex min-w-0 items-center gap-2">
              <ThemeDots themeId={themeId} mode={props.mode} />
              <span className="truncate">{themes[themeId]?.name ?? themeId}</span>
            </span>
          </SelectItem>
        ))}
        {props.footnote ? (
          <>
            <SelectSeparator />
            <p className="px-2 py-1.5 text-[11px] text-text-weaker">{props.footnote}</p>
          </>
        ) : null}
      </SelectContent>
    </Select>
  )
}

function ThemeSamplePage(props: { tokens: ResolvedTheme }) {
  const tokens = props.tokens

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border-base/60 px-4 py-3"
      style={{ backgroundColor: tokenColor(tokens, "background-base") }}
    >
      <p
        className="text-[15px] font-bold leading-tight"
        style={{ color: textColor(tokens, "markdown-heading") }}
      >
        {language.t("settings.appearance.themeSampleHeading")}
      </p>
      <p className="text-xs leading-relaxed" style={{ color: textColor(tokens, "markdown-text") }}>
        <span className="font-semibold" style={{ color: textColor(tokens, "markdown-strong") }}>
          {language.t("settings.appearance.themeSampleLabel")}
        </span>{" "}
        {language.t("settings.appearance.themeSampleBody")}{" "}
        <span className="underline" style={{ color: textColor(tokens, "markdown-link-text") }}>
          {language.t("settings.appearance.themeSampleLink")}
        </span>{" "}
        {language.t("settings.appearance.themeSampleBodyEnd")}
      </p>
      <p
        className="rounded-md px-2 py-1.5 font-mono text-[11px]"
        style={{
          backgroundColor:
            tokenColor(tokens, "background-stronger") ?? tokenColor(tokens, "background-base"),
        }}
      >
        <span style={{ color: textColor(tokens, "syntax-keyword") }}>{SAMPLE_CODE.keyword}</span>{" "}
        <span style={{ color: textColor(tokens, "syntax-variable") }}>{SAMPLE_CODE.variable}</span>{" "}
        <span style={{ color: textColor(tokens, "syntax-operator") }}>{SAMPLE_CODE.operator}</span>{" "}
        <span style={{ color: textColor(tokens, "syntax-string") }}>{SAMPLE_CODE.string}</span>{" "}
        <span style={{ color: textColor(tokens, "syntax-comment") }}>{SAMPLE_CODE.comment}</span>
      </p>
    </div>
  )
}

function ThemeSample(props: { mode: ThemeMode; themeId: string; inUse: boolean }) {
  const { themes } = useTheme()
  const tokens = themeTokens(props.themeId, props.mode)
  if (!tokens) return null

  const Icon = MODE_ICON[props.mode]

  return (
    <figure
      data-component="settings-theme-sample"
      data-mode={props.mode}
      className="flex min-w-0 flex-col gap-2"
    >
      <ThemeSamplePage tokens={tokens} />
      <figcaption className="flex h-5 items-center justify-between gap-2 px-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <Icon aria-hidden className="size-3.5 shrink-0 text-icon-weak-base" />
          <span className="shrink-0 font-medium text-text-base">
            {language.t(MODE_LABEL_KEY[props.mode])}
          </span>
          <span className="truncate text-text-weaker">
            {themes[props.themeId]?.name ?? props.themeId}
          </span>
        </span>
        {props.inUse ? (
          <Badge variant="outline" className="h-5 shrink-0">
            {language.t("settings.appearance.themeInUse")}
          </Badge>
        ) : null}
      </figcaption>
    </figure>
  )
}

function lightThemesNotListedNote(count: number): string | undefined {
  if (count <= 0) return undefined
  return count === 1
    ? language.t("settings.appearance.lightThemesNotListed.one")
    : language.t("settings.appearance.lightThemesNotListed.other", { count })
}

export function ThemeColorsSection(props: { controlClassName: string }) {
  const { colorScheme, mode, lightThemeId, darkThemeId, setThemeForMode, setColorScheme } =
    useTheme()
  const lightThemeIds = selectableThemeIDs("light")
  const darkThemeIds = selectableThemeIDs("dark")

  const colorSchemeOptions: ReadonlyArray<{ value: ColorScheme; label: string }> = [
    { value: "system", label: language.t("settings.appearance.colorSchemes.system") },
    { value: "light", label: language.t("settings.appearance.colorSchemes.light") },
    { value: "dark", label: language.t("settings.appearance.colorSchemes.dark") },
  ]

  return (
    <SettingsSection title={language.t("settings.appearance.colorsSection")}>
      <SettingsRow
        title={language.t("settings.appearance.colorSchemeTitle")}
        control={
          <Select
            value={colorScheme}
            onValueChange={(value) => {
              if (isColorScheme(value)) setColorScheme(value)
            }}
          >
            <SelectTrigger data-action="settings-color-scheme" className={props.controlClassName}>
              <SelectValue placeholder={language.t("settings.appearance.colorSchemePlaceholder")} />
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
        title={language.t("settings.appearance.lightThemeTitle")}
        description={language.t("settings.appearance.lightThemeDescription")}
        control={
          <ThemeSelect
            mode="light"
            value={lightThemeId}
            themeIds={lightThemeIds}
            ariaLabel={language.t("settings.appearance.lightThemeTitle")}
            dataAction="settings-light-theme"
            className={props.controlClassName}
            footnote={lightThemesNotListedNote(darkThemeIds.length - lightThemeIds.length)}
            onChange={(themeId) => setThemeForMode("light", themeId)}
          />
        }
      />
      <SettingsRow
        title={language.t("settings.appearance.darkThemeTitle")}
        description={language.t("settings.appearance.darkThemeDescription")}
        control={
          <ThemeSelect
            mode="dark"
            value={darkThemeId}
            themeIds={darkThemeIds}
            ariaLabel={language.t("settings.appearance.darkThemeTitle")}
            dataAction="settings-dark-theme"
            className={props.controlClassName}
            onChange={(themeId) => setThemeForMode("dark", themeId)}
          />
        }
      />
      <div className="grid gap-4 border-t border-border-base/60 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <ThemeSample mode="light" themeId={lightThemeId} inUse={mode === "light"} />
        <ThemeSample mode="dark" themeId={darkThemeId} inUse={mode === "dark"} />
      </div>
    </SettingsSection>
  )
}
