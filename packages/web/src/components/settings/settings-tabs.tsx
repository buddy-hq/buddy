import type { ReactNode } from "react"
import {
  BlocksIcon,
  BookOpenIcon,
  BrainIcon,
  CogIcon,
  UserRoundIcon,
  ScaleIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react"
import { GeneralSettings } from "./settings-general"
import { ProvidersSettings } from "./settings-providers"
import { McpsSettings } from "./settings-mcps"
import { AdvancedSettings } from "./settings-advanced"
import { StandardsSettings } from "./settings-tools"
import { AttributionSettings } from "./settings-attribution"
import { LearnerMemorySettings } from "./settings-learner-memory"
import { PersonalizationSettings } from "./settings-personalization"
import type { SettingsWorkbench } from "./settings-workbench"

export type SettingsTab =
  | "general"
  | "providers"
  | "mcps"
  | "personalization"
  | "learnerMemory"
  | "advanced"
  | "attribution"
  | "standards"

export type SettingsTabGroup = "main" | "optional"

export type SettingsTabScope = "global" | "notebook" | "mixed" | "info"

export type SettingsTabDefinition = {
  id: SettingsTab
  navLabelKey: string
  icon: LucideIcon
  layout: "standard" | "full-page"
  group: SettingsTabGroup
  scope: SettingsTabScope
  render: (workbench: SettingsWorkbench) => ReactNode
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
    scope: "global",
    render: (workbench) => <GeneralSettings workbench={workbench} />,
  },
  {
    id: "providers",
    navLabelKey: "routes.settings.nav.providers",
    icon: SettingsIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: (workbench) => <ProvidersSettings workbench={workbench} />,
  },
  {
    id: "mcps",
    navLabelKey: "routes.settings.nav.mcps",
    icon: BlocksIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: (workbench) => <McpsSettings workbench={workbench} />,
  },
  {
    id: "personalization",
    navLabelKey: "routes.settings.nav.personalization",
    icon: UserRoundIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: (workbench) => <PersonalizationSettings workbench={workbench} />,
  },
  {
    id: "learnerMemory",
    navLabelKey: "routes.settings.nav.learnerMemory",
    icon: BrainIcon,
    layout: "standard",
    group: "main",
    scope: "mixed",
    render: (workbench) => <LearnerMemorySettings workbench={workbench} />,
  },
  {
    id: "advanced",
    navLabelKey: "routes.settings.nav.advanced",
    icon: CogIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: (workbench) => <AdvancedSettings workbench={workbench} />,
  },
  {
    id: "attribution",
    navLabelKey: "routes.settings.nav.attribution",
    icon: ScaleIcon,
    layout: "standard",
    group: "main",
    scope: "info",
    render: () => <AttributionSettings />,
  },
  {
    id: "standards",
    navLabelKey: "routes.settings.nav.standards",
    icon: BookOpenIcon,
    layout: "standard",
    group: "optional",
    scope: "mixed",
    render: (workbench) => <StandardsSettings workbench={workbench} />,
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
