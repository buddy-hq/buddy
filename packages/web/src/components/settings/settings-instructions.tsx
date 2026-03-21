import { GlobalAgentsMdSettingsPanel } from "./global-agents-md-settings-panel"
import { SettingsPanelContent } from "./settings-page"

export function InstructionsSettings() {
  return (
    <SettingsPanelContent
      title="Instructions"
      description="Manage global AGENTS.md instructions that apply to every notebook session."
    >
      <GlobalAgentsMdSettingsPanel active />
    </SettingsPanelContent>
  )
}
