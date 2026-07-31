import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { obsidianSkill } from "./skills/obsidian"

export const obsidianVaultFeature = defineBuddyFeature({
  id: "obsidian-vault",
  enabledWhen: (config) => config.obsidian_vault?.connected === true,
  tools: [],
  skills: [obsidianSkill],
  subagents: [],
  surfaces: [],
})
