import type { ReactNode } from "react"
import type { SettingsTab } from "./settings-primitives"
import { InstructionsSettings } from "./settings-instructions"
import { AppearanceSettings } from "./settings-appearance"
import { NotebookSettings } from "./settings-notebook"
import { ModelSettings } from "./settings-model"
import { ProvidersSettings } from "./settings-providers"
import { McpsSettings } from "./settings-mcps"
import { SkillsPage } from "@/components/skills/skills-page"
import { AdvancedSettings } from "./settings-advanced"

type SettingsPageProps = {
  directory: string
  activeTab: SettingsTab
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <div
      data-component="settings-page"
      data-active-tab={props.activeTab}
      className="flex h-full min-h-0 min-w-0 flex-col"
    >
      {props.activeTab === "instructions" && <InstructionsSettings />}
      {props.activeTab === "appearance" && <AppearanceSettings />}
      {props.activeTab === "notebook" && <NotebookSettings directory={props.directory} />}
      {props.activeTab === "model" && <ModelSettings directory={props.directory} />}
      {props.activeTab === "providers" && <ProvidersSettings directory={props.directory} />}
      {props.activeTab === "mcps" && <McpsSettings directory={props.directory} />}
      {props.activeTab === "skills" && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <SkillsPage directory={props.directory} />
        </div>
      )}
      {props.activeTab === "advanced" && <AdvancedSettings directory={props.directory} />}
    </div>
  )
}

export function SettingsPanelContent(props: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto p-6">
      <div>
        <h1 className="text-lg font-semibold">{props.title}</h1>
        <p className="mt-1 text-sm text-text-weak">{props.description}</p>
      </div>
      {props.children}
    </div>
  )
}
