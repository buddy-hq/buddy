import type { ReactNode } from "react"
import {
  BlocksIcon,
  BookOpenIcon,
  BrainIcon,
  CogIcon,
  FileTextIcon,
  PaletteIcon,
  SettingsIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { InstructionsSettings } from "./settings-instructions"
import { AppearanceSettings } from "./settings-appearance"
import { NotebookSettings } from "./settings-notebook"
import { ModelSettings } from "./settings-model"
import { ProvidersSettings } from "./settings-providers"
import { McpsSettings } from "./settings-mcps"
import { SkillsPage } from "@/components/skills/skills-page"
import { AdvancedSettings } from "./settings-advanced"

export type SettingsTab =
  | "instructions"
  | "appearance"
  | "notebook"
  | "model"
  | "providers"
  | "mcps"
  | "skills"
  | "advanced"

export type SettingsTabDefinition = {
  id: SettingsTab
  navLabelKey: string
  icon: LucideIcon
  layout: "standard" | "full-page"
  render: (directory: string) => ReactNode
}

export const SETTINGS_TABS: SettingsTabDefinition[] = [
  {
    id: "appearance",
    navLabelKey: "routes.settings.nav.appearance",
    icon: PaletteIcon,
    layout: "standard",
    render: () => <AppearanceSettings />,
  },
  {
    id: "instructions",
    navLabelKey: "routes.settings.nav.instructions",
    icon: FileTextIcon,
    layout: "standard",
    render: () => <InstructionsSettings />,
  },
  {
    id: "notebook",
    navLabelKey: "routes.settings.nav.notebook",
    icon: BookOpenIcon,
    layout: "standard",
    render: (directory) => <NotebookSettings directory={directory} />,
  },
  {
    id: "model",
    navLabelKey: "common.model",
    icon: BrainIcon,
    layout: "standard",
    render: (directory) => <ModelSettings directory={directory} />,
  },
  {
    id: "providers",
    navLabelKey: "routes.settings.nav.providers",
    icon: SettingsIcon,
    layout: "standard",
    render: (directory) => <ProvidersSettings directory={directory} />,
  },
  {
    id: "mcps",
    navLabelKey: "routes.settings.nav.mcps",
    icon: BlocksIcon,
    layout: "standard",
    render: (directory) => <McpsSettings directory={directory} />,
  },
  {
    id: "skills",
    navLabelKey: "routes.settings.nav.skills",
    icon: SparklesIcon,
    layout: "full-page",
    render: (directory) => <SkillsPage directory={directory} />,
  },
  {
    id: "advanced",
    navLabelKey: "routes.settings.nav.advanced",
    icon: CogIcon,
    layout: "standard",
    render: (directory) => <AdvancedSettings directory={directory} />,
  },
]

export function isSettingsTab(value: string): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value)
}

export function getSettingsTabDefinition(id: SettingsTab): SettingsTabDefinition {
  return SETTINGS_TABS.find((tab) => tab.id === id) || SETTINGS_TABS[0]
}
