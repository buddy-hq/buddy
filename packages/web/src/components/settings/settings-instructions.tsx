import { language } from "@/context/language"
import { GlobalAgentsMdSettingsPanel } from "./global-agents-md-settings-panel"
import { SettingsPanelContent } from "./settings-page"

export function InstructionsSettings() {
  return (
    <SettingsPanelContent
      title={language.t("settings.instructions.title")}
      description={language.t("settings.instructions.description")}
    >
      <GlobalAgentsMdSettingsPanel active />
    </SettingsPanelContent>
  )
}
