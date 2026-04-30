import { language } from "@/context/language"
import { GlobalAgentsMdSettingsPanel } from "./global-agents-md-settings-panel"
import { SettingsContent } from "./settings-primitives"

export function InstructionsSettings() {
  return (
    <SettingsContent
      title={language.t("settings.instructions.title")}
      description={language.t("settings.instructions.description")}
      eyebrow="Global settings"
      fillHeight
    >
      <GlobalAgentsMdSettingsPanel active />
    </SettingsContent>
  )
}
