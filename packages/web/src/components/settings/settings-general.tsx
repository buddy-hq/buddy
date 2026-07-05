import { useMemo } from "react"
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@buddy/ui"
import { language } from "@/context/language"
import {
  FOLLOWUP_BEHAVIOR_QUEUE,
  FOLLOWUP_BEHAVIOR_STEER,
  useChatSettings,
  type FollowupBehavior,
} from "@/state/chat-settings"
import {
  GAME_PROMPT_PREFERENCE_DISABLED,
  GAME_PROMPT_PREFERENCE_REDUCED,
  GAME_PROMPT_PREFERENCE_STANDARD,
  useGameStore,
  type TGamePromptPreference,
} from "@/state/game-store"
import { useNotificationPreferences } from "@/state/notification-preferences"
import { useTheme, type ColorScheme } from "@/theme"
import {
  CODE_FONT_PLACEHOLDER,
  MAX_APPEARANCE_FONT_SIZE,
  MIN_APPEARANCE_FONT_SIZE,
  UI_FONT_PLACEHOLDER,
  codeFontFamily,
  normalizeAppearanceFontSize,
  uiFontFamily,
  useAppearancePreferences,
} from "@/state/appearance-preferences"
import { SettingsContent, SettingsSection, SettingsRow } from "./settings-primitives"

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

function isFollowupBehavior(value: string): value is FollowupBehavior {
  return value === FOLLOWUP_BEHAVIOR_STEER || value === FOLLOWUP_BEHAVIOR_QUEUE
}

function isGamePromptPreference(value: string): value is TGamePromptPreference {
  return (
    value === GAME_PROMPT_PREFERENCE_STANDARD ||
    value === GAME_PROMPT_PREFERENCE_REDUCED ||
    value === GAME_PROMPT_PREFERENCE_DISABLED
  )
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

function FontSizeInput(props: {
  value: number
  ariaLabel: string
  dataAction: string
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        data-action={props.dataAction}
        type="number"
        min={MIN_APPEARANCE_FONT_SIZE}
        max={MAX_APPEARANCE_FONT_SIZE}
        step={1}
        value={props.value}
        aria-label={props.ariaLabel}
        className="h-8 w-20 text-right text-xs tabular-nums"
        onChange={(event) => {
          const value = Number(event.currentTarget.value)
          if (Number.isFinite(value)) {
            props.onChange(normalizeAppearanceFontSize(value, props.value))
          }
        }}
      />
      <span className="w-5 text-xs text-text-weak">px</span>
    </div>
  )
}

export function GeneralSettings() {
  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()
  const uiFont = useAppearancePreferences((state) => state.uiFont)
  const codeFont = useAppearancePreferences((state) => state.codeFont)
  const uiFontSize = useAppearancePreferences((state) => state.uiFontSize)
  const codeFontSize = useAppearancePreferences((state) => state.codeFontSize)
  const setUiFont = useAppearancePreferences((state) => state.setUiFont)
  const setCodeFont = useAppearancePreferences((state) => state.setCodeFont)
  const setUiFontSize = useAppearancePreferences((state) => state.setUiFontSize)
  const setCodeFontSize = useAppearancePreferences((state) => state.setCodeFontSize)
  const followupBehavior = useChatSettings((state) => state.followupBehavior)
  const setFollowupBehavior = useChatSettings((state) => state.setFollowupBehavior)
  const notificationPreferences = useNotificationPreferences((state) => state.preferences)
  const setAgentNotifications = useNotificationPreferences((state) => state.setAgent)
  const setPermissionNotifications = useNotificationPreferences((state) => state.setPermissions)
  const setErrorNotifications = useNotificationPreferences((state) => state.setErrors)
  const gamePromptPreference = useGameStore((state) => state.gamePromptPreference)
  const setGamePromptPreference = useGameStore((state) => state.setGamePromptPreference)

  const colorSchemeOptions: ReadonlyArray<{ value: ColorScheme; label: string }> = [
    { value: "system", label: language.t("settings.appearance.colorSchemes.system") },
    { value: "light", label: language.t("settings.appearance.colorSchemes.light") },
    { value: "dark", label: language.t("settings.appearance.colorSchemes.dark") },
  ]

  const followupBehaviorOptions: ReadonlyArray<{ value: FollowupBehavior; label: string }> = [
    {
      value: FOLLOWUP_BEHAVIOR_STEER,
      label: language.t("settings.general.followupSteerOption"),
    },
    {
      value: FOLLOWUP_BEHAVIOR_QUEUE,
      label: language.t("settings.general.followupQueueOption"),
    },
  ]

  const gamePromptPreferenceOptions: ReadonlyArray<{
    value: TGamePromptPreference
    label: string
  }> = [
    {
      value: GAME_PROMPT_PREFERENCE_STANDARD,
      label: language.t("settings.general.gamePromptStandardOption"),
    },
    {
      value: GAME_PROMPT_PREFERENCE_REDUCED,
      label: language.t("settings.general.gamePromptReducedOption"),
    },
    {
      value: GAME_PROMPT_PREFERENCE_DISABLED,
      label: language.t("settings.general.gamePromptDisabledOption"),
    },
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
      <SettingsSection title="Appearance">
        <SettingsRow
          title={language.t("settings.appearance.colorSchemeTitle")}
          description={language.t("settings.appearance.colorSchemeDescription")}
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
          description={language.t("settings.appearance.themeDescription")}
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
          description={language.t("settings.general.uiFontDescription")}
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
          description={language.t("settings.general.codeFontDescription")}
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
          description={language.t("settings.general.uiFontSizeDescription")}
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
          description={language.t("settings.general.codeFontSizeDescription")}
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

      <SettingsSection title="Chat">
        <SettingsRow
          title={language.t("settings.general.followupTitle")}
          description={language.t("settings.general.followupDescription")}
          control={
            <Select
              value={followupBehavior}
              onValueChange={(value) => {
                if (isFollowupBehavior(value)) {
                  setFollowupBehavior(value)
                }
              }}
            >
              <SelectTrigger data-action="settings-followup-behavior" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {followupBehaviorOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          title={language.t("settings.general.gamePromptTitle")}
          description={language.t("settings.general.gamePromptDescription")}
          control={
            <Select
              value={gamePromptPreference}
              onValueChange={(value) => {
                if (isGamePromptPreference(value)) {
                  setGamePromptPreference(value)
                }
              }}
            >
              <SelectTrigger data-action="settings-game-prompt-preference" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gamePromptPreferenceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection title="Notifications">
        <SettingsRow
          title={language.t("settings.general.notificationsAgentTitle")}
          description={language.t("settings.general.notificationsAgentDescription")}
          control={
            <Switch
              data-action="settings-notifications-agent"
              checked={notificationPreferences.agent}
              onCheckedChange={setAgentNotifications}
              aria-label={language.t("settings.general.notificationsAgentAria")}
            />
          }
        />
        <SettingsRow
          title={language.t("settings.general.notificationsPermissionsTitle")}
          description={language.t("settings.general.notificationsPermissionsDescription")}
          control={
            <Switch
              data-action="settings-notifications-permissions"
              checked={notificationPreferences.permissions}
              onCheckedChange={setPermissionNotifications}
              aria-label={language.t("settings.general.notificationsPermissionsAria")}
            />
          }
        />
        <SettingsRow
          title={language.t("settings.general.notificationsErrorsTitle")}
          description={language.t("settings.general.notificationsErrorsDescription")}
          control={
            <Switch
              data-action="settings-notifications-errors"
              checked={notificationPreferences.errors}
              onCheckedChange={setErrorNotifications}
              aria-label={language.t("settings.general.notificationsErrorsAria")}
            />
          }
        />
      </SettingsSection>
    </SettingsContent>
  )
}
