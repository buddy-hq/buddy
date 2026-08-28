import { SettingsContent } from "./settings-primitives"
import { LearnerMemorySettingsSections } from "./settings-learner-memory"

export function MemorySettings() {
  return (
    <SettingsContent>
      <LearnerMemorySettingsSections />
    </SettingsContent>
  )
}
