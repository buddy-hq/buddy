import { useChatStore } from "@/state/chat-store"
import {
  SKILLS_CATALOG_LAYOUT_TWO_COLUMNS,
  SkillsCatalogSurface,
} from "@/components/directory-chat/right-workspace-skills-drawer"
import { SettingsContent } from "./settings-primitives"

const GLOBAL_SKILLS_DIRECTORY = ""

export function SkillsSettings() {
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const fallbackDirectory = useChatStore((state) => state.openProjects[0])
  const directory = activeDirectory ?? fallbackDirectory ?? GLOBAL_SKILLS_DIRECTORY

  return (
    <SettingsContent>
      <div data-component="settings-skills" className="w-full min-w-0">
        <SkillsCatalogSurface directory={directory} layout={SKILLS_CATALOG_LAYOUT_TWO_COLUMNS} />
      </div>
    </SettingsContent>
  )
}
