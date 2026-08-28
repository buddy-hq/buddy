import { Switch } from "@buddy/ui"
import { language } from "@/context/language"
import { useNotificationPreferences } from "@/state/notification-preferences"
import { SettingsContent, SettingsRow, SettingsSection } from "./settings-primitives"

export function NotificationsSettings() {
  const notificationPreferences = useNotificationPreferences((state) => state.preferences)
  const setAgentNotifications = useNotificationPreferences((state) => state.setAgent)
  const setPermissionNotifications = useNotificationPreferences((state) => state.setPermissions)
  const setErrorNotifications = useNotificationPreferences((state) => state.setErrors)

  return (
    <SettingsContent>
      <SettingsSection title={language.t("settings.general.notificationsSection")}>
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
