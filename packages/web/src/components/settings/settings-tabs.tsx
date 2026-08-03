import type { ReactNode } from "react"
import { BotIcon } from "@buddy/ui"
import {
  BlocksIcon,
  BoxesIcon,
  BrainIcon,
  CpuSettingsIcon,
  RefreshCwIcon,
  UserRoundIcon,
  ScaleIcon,
  Settings05Icon,
  TeachingIcon,
  type AppIcon,
} from "@/icons/app-icons"
import { GeneralSettings } from "./settings-general"
import { ProvidersSettings } from "./settings-providers"
import { McpsSettings } from "./settings-mcps"
import { SkillsSettings } from "./settings-skills"
import { AdvancedSettings } from "./settings-advanced"
import { StandardsSettings } from "./settings-tools"
import { AttributionSettings } from "./settings-attribution"
import { LearnerMemorySettings } from "./settings-learner-memory"
import { PersonalizationSettings } from "./settings-personalization"
import { UpdatesSettings } from "./settings-updates"
import {
  EXPERIMENTAL_FEATURE_ID,
  type ExperimentalFeatureID,
} from "@/state/experimental-features-query"
import type { PrimaryUse } from "@/state/project-config-readers"

export type SettingsTab =
  | "general"
  | "updates"
  | "providers"
  | "skills"
  | "mcps"
  | "personalization"
  | "learnerMemory"
  | "advanced"
  | "attribution"
  | "standards"

export type SettingsTabGroup = "main" | "optional"

export type SettingsTabScope = "global" | "info"

export type SettingsTabDefinition = {
  id: SettingsTab
  navLabelKey: string
  icon: AppIcon
  layout: "standard" | "full-page"
  group: SettingsTabGroup
  scope: SettingsTabScope
  experimentalFeatureID?: ExperimentalFeatureID
  badgeLabelKey?: string
  render: () => ReactNode
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
    icon: Settings05Icon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: () => <GeneralSettings />,
  },
  {
    id: "updates",
    navLabelKey: "routes.settings.nav.updates",
    icon: RefreshCwIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: () => <UpdatesSettings />,
  },
  {
    id: "providers",
    navLabelKey: "routes.settings.nav.providers",
    icon: BotIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: () => <ProvidersSettings />,
  },
  {
    id: "skills",
    navLabelKey: "routes.settings.nav.skills",
    icon: BoxesIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: () => <SkillsSettings />,
  },
  {
    id: "mcps",
    navLabelKey: "routes.settings.nav.mcps",
    icon: BlocksIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: () => <McpsSettings />,
  },
  {
    id: "personalization",
    navLabelKey: "routes.settings.nav.personalization",
    icon: UserRoundIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: () => <PersonalizationSettings />,
  },
  {
    id: "learnerMemory",
    navLabelKey: "routes.settings.nav.learnerMemory",
    icon: BrainIcon,
    layout: "standard",
    group: "optional",
    scope: "global",
    experimentalFeatureID: EXPERIMENTAL_FEATURE_ID.learnerMemory,
    badgeLabelKey: "settings.advanced.experimentalBadge",
    render: () => <LearnerMemorySettings />,
  },
  {
    id: "advanced",
    navLabelKey: "routes.settings.nav.advanced",
    icon: CpuSettingsIcon,
    layout: "standard",
    group: "main",
    scope: "global",
    render: () => <AdvancedSettings />,
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
    icon: TeachingIcon,
    layout: "standard",
    group: "optional",
    scope: "global",
    render: () => <StandardsSettings />,
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
  primaryUse?: PrimaryUse
  enabledExperimentalFeatureIDs: ReadonlySet<ExperimentalFeatureID>
}): SettingsTabDefinition[] {
  return SETTINGS_TABS.filter((tab) => {
    if (
      tab.experimentalFeatureID &&
      !input.enabledExperimentalFeatureIDs.has(tab.experimentalFeatureID)
    ) {
      return false
    }

    if (tab.group === "main") {
      return true
    }

    if (tab.id === "standards") {
      return input.primaryUse === "teach" || input.standardsEnabled
    }

    return tab.experimentalFeatureID !== undefined
  })
}

export function settingsTabGroupForPrimaryUse(
  tab: SettingsTabDefinition,
  primaryUse: PrimaryUse | undefined,
): SettingsTabGroup {
  return tab.id === "standards" && primaryUse === "teach" ? "main" : tab.group
}

export function getSettingsTabDefinition(id: SettingsTab): SettingsTabDefinition {
  return SETTINGS_TABS.find((tab) => tab.id === id) || SETTINGS_TABS[0]
}
