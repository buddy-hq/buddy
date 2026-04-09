import type { ReactNode } from "react"
import {
  BlocksIcon,
  BookOpenIcon,
  CogIcon,
  FileTextIcon,
  ScaleIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { InstructionsSettings } from "./settings-instructions"
import { GeneralSettings } from "./settings-general"
import { ProvidersSettings } from "./settings-providers"
import { McpsSettings } from "./settings-mcps"
import { SkillsPage } from "@/components/skills/skills-page"
import { AdvancedSettings } from "./settings-advanced"
import { StandardsSettings } from "./settings-tools"
import { AttributionSettings } from "./settings-attribution"

export type SettingsTab =
  | "general"
  | "providers"
  | "mcps"
  | "skills"
  | "instructions"
  | "advanced"
  | "attribution"
  | "standards"

export type SettingsTabGroup = "main" | "optional"

export type SettingsTabDefinition = {
  id: SettingsTab
  navLabelKey: string
  icon: LucideIcon
  layout: "standard" | "full-page"
  group: SettingsTabGroup
  render: (directory: string) => ReactNode
}

const SETTINGS_TAB_ALIAS_MAP = {
  appearance: "general",
  notebook: "general",
  tools: "standards",
} as const satisfies Record<string, SettingsTab>

export const DEFAULT_SETTINGS_TAB: SettingsTab = "general"

export const SETTINGS_TABS: SettingsTabDefinition[] = [
  {
    id: "general",
    navLabelKey: "routes.settings.nav.general",
    icon: SlidersHorizontalIcon,
    layout: "standard",
    group: "main",
    render: (directory) => <GeneralSettings directory={directory} />,
  },
  {
    id: "providers",
    navLabelKey: "routes.settings.nav.providers",
    icon: SettingsIcon,
    layout: "standard",
    group: "main",
    render: (directory) => <ProvidersSettings directory={directory} />,
  },
  {
    id: "mcps",
    navLabelKey: "routes.settings.nav.mcps",
    icon: BlocksIcon,
    layout: "standard",
    group: "main",
    render: (directory) => <McpsSettings directory={directory} />,
  },
  {
    id: "skills",
    navLabelKey: "routes.settings.nav.skills",
    icon: SparklesIcon,
    layout: "full-page",
    group: "main",
    render: (directory) => <SkillsPage directory={directory} />,
  },
  {
    id: "instructions",
    navLabelKey: "routes.settings.nav.instructions",
    icon: FileTextIcon,
    layout: "standard",
    group: "main",
    render: () => <InstructionsSettings />,
  },
  {
    id: "advanced",
    navLabelKey: "routes.settings.nav.advanced",
    icon: CogIcon,
    layout: "standard",
    group: "main",
    render: (directory) => <AdvancedSettings directory={directory} />,
  },
  {
    id: "attribution",
    navLabelKey: "routes.settings.nav.attribution",
    icon: ScaleIcon,
    layout: "standard",
    group: "main",
    render: () => <AttributionSettings />,
  },
  {
    id: "standards",
    navLabelKey: "routes.settings.nav.standards",
    icon: BookOpenIcon,
    layout: "standard",
    group: "optional",
    render: (directory) => <StandardsSettings directory={directory} />,
  },
]

export function isSettingsTab(value: string): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value)
}

export function resolveSettingsTab(value: string): SettingsTab | undefined {
  if (isSettingsTab(value)) {
    return value
  }

  if (value === "appearance") {
    return SETTINGS_TAB_ALIAS_MAP.appearance
  }
  if (value === "notebook") {
    return SETTINGS_TAB_ALIAS_MAP.notebook
  }
  if (value === "tools") {
    return SETTINGS_TAB_ALIAS_MAP.tools
  }

  return undefined
}

export function getVisibleSettingsTabDefinitions(input: {
  standardsEnabled: boolean
}): SettingsTabDefinition[] {
  return SETTINGS_TABS.filter((tab) => {
    if (tab.group === "main") {
      return true
    }

    return tab.id === "standards" && input.standardsEnabled
  })
}

export function getSettingsTabDefinition(id: SettingsTab): SettingsTabDefinition {
  return SETTINGS_TABS.find((tab) => tab.id === id) || SETTINGS_TABS[0]
}
