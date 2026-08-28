import type { ReactNode } from "react"
import {
  AlertCircleIcon,
  BlocksIcon,
  BotIcon,
  BoxesIcon,
  BrainIcon,
  InfoIcon,
  PaintbrushIcon,
  CpuSettingsIcon,
  UserRoundIcon,
  Settings05Icon,
  TeachingIcon,
  type AppIcon,
} from "@/icons/app-icons"
import { GeneralSettings } from "./settings-general"
import { AppearanceSettings } from "./settings-appearance"
import { NotificationsSettings } from "./settings-notifications"
import { PersonalizationSettings } from "./settings-personalization"
import { ProvidersSettings } from "./settings-providers"
import { McpsSettings } from "./settings-mcps"
import { SkillsSettings } from "./settings-skills"
import { PackagesSettings } from "./settings-packages"
import { StandardsSettings } from "./settings-standards"
import { MemorySettings } from "./settings-memory"
import { AboutSettings } from "./settings-about"
import {
  EXPERIMENTAL_FEATURE_ID,
  type ExperimentalFeatureID,
} from "@/state/experimental-features-query"
import type { PrimaryUse } from "@/state/project-config-readers"

export type SettingsTab =
  | "general"
  | "appearance"
  | "notifications"
  | "personalization"
  | "providers"
  | "skills"
  | "mcps"
  | "packages"
  | "standards"
  | "memory"
  | "about"

/**
 * Which optional capability reveals a tab. Core tabs have none and are always listed; a revealed
 * tab appears only once its own capability is active, and each one is independent of the others —
 * turning on memory must never surface standards, or vice versa.
 */
export type SettingsTabReveal = "standards" | "memory"

export type SettingsTabRenderContext = {
  onOpenTab: (tab: SettingsTab) => void
}

export type SettingsTabDefinition = {
  id: SettingsTab
  navLabelKey: string
  icon: AppIcon
  layout: "standard" | "full-page"
  reveal?: SettingsTabReveal
  badgeLabelKey?: string
  render: (context: SettingsTabRenderContext) => ReactNode
}

/**
 * Retired tab ids kept so existing `?tab=` links and bookmarks still resolve.
 * Every id that has ever shipped must map to a tab that exists today — and to a *core* one:
 * a revealed tab is hidden until its capability is on, so aliasing to one would bounce the
 * reader to General and destroy the link. The ids whose content now lives behind a reveal
 * point at Packages instead, which is where that capability is turned on.
 */
const SETTINGS_TAB_ALIAS_MAP = {
  chat: "general",
  notebook: "general",
  tools: "packages",
  teaching: "packages",
  learnerMemory: "packages",
  advanced: "packages",
  labs: "packages",
  updates: "about",
  attribution: "about",
} as const satisfies Record<string, SettingsTab>

export const DEFAULT_SETTINGS_TAB: SettingsTab = "general"

export const SETTINGS_TABS: SettingsTabDefinition[] = [
  {
    id: "general",
    navLabelKey: "routes.settings.nav.general",
    icon: Settings05Icon,
    layout: "standard",
    render: () => <GeneralSettings />,
  },
  {
    id: "appearance",
    navLabelKey: "routes.settings.nav.appearance",
    icon: PaintbrushIcon,
    layout: "standard",
    render: () => <AppearanceSettings />,
  },
  {
    id: "notifications",
    navLabelKey: "routes.settings.nav.notifications",
    icon: AlertCircleIcon,
    layout: "standard",
    render: () => <NotificationsSettings />,
  },
  {
    id: "personalization",
    navLabelKey: "routes.settings.nav.personalization",
    icon: UserRoundIcon,
    layout: "standard",
    render: () => <PersonalizationSettings />,
  },
  {
    id: "providers",
    navLabelKey: "routes.settings.nav.providers",
    icon: BotIcon,
    layout: "standard",
    render: () => <ProvidersSettings />,
  },
  {
    id: "skills",
    navLabelKey: "routes.settings.nav.skills",
    icon: BoxesIcon,
    layout: "standard",
    render: () => <SkillsSettings />,
  },
  {
    id: "mcps",
    navLabelKey: "routes.settings.nav.mcps",
    icon: BlocksIcon,
    layout: "standard",
    render: () => <McpsSettings />,
  },
  {
    id: "packages",
    navLabelKey: "routes.settings.nav.packages",
    icon: CpuSettingsIcon,
    layout: "standard",
    render: () => <PackagesSettings />,
  },
  {
    id: "about",
    navLabelKey: "routes.settings.nav.about",
    icon: InfoIcon,
    layout: "standard",
    render: () => <AboutSettings />,
  },
  {
    id: "standards",
    navLabelKey: "routes.settings.nav.standards",
    icon: TeachingIcon,
    layout: "standard",
    reveal: "standards",
    render: (context) => <StandardsSettings onOpenTab={context.onOpenTab} />,
  },
  {
    id: "memory",
    navLabelKey: "routes.settings.nav.memory",
    icon: BrainIcon,
    layout: "standard",
    reveal: "memory",
    badgeLabelKey: "settings.advanced.experimentalBadge",
    render: () => <MemorySettings />,
  },
]

export function isSettingsTab(value: string): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value)
}

function isRetiredSettingsTab(value: string): value is keyof typeof SETTINGS_TAB_ALIAS_MAP {
  return Object.hasOwn(SETTINGS_TAB_ALIAS_MAP, value)
}

export function resolveSettingsTab(value: string): SettingsTab | undefined {
  if (isSettingsTab(value)) {
    return value
  }

  return isRetiredSettingsTab(value) ? SETTINGS_TAB_ALIAS_MAP[value] : undefined
}

export type SettingsTabVisibilityInput = {
  standardsEnabled: boolean
  primaryUse?: PrimaryUse
  enabledExperimentalFeatureIDs: ReadonlySet<ExperimentalFeatureID>
}

function revealIsActive(reveal: SettingsTabReveal, input: SettingsTabVisibilityInput): boolean {
  if (reveal === "standards") {
    // Teachers see the tab before installing so the feature is discoverable; the panel itself
    // offers the install rather than a wall of dead switches.
    return input.standardsEnabled || input.primaryUse === "teach"
  }

  return input.enabledExperimentalFeatureIDs.has(EXPERIMENTAL_FEATURE_ID.learnerMemory)
}

export function isCoreSettingsTab(tab: SettingsTabDefinition): boolean {
  return tab.reveal === undefined
}

export function getVisibleSettingsTabDefinitions(
  input: SettingsTabVisibilityInput,
): SettingsTabDefinition[] {
  return SETTINGS_TABS.filter((tab) => tab.reveal === undefined || revealIsActive(tab.reveal, input))
}

export function getSettingsTabDefinition(id: SettingsTab): SettingsTabDefinition {
  return SETTINGS_TABS.find((tab) => tab.id === id) || SETTINGS_TABS[0]
}
