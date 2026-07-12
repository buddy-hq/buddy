import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { obsidianSkill } from "./skills/obsidian"

export const obsidianVaultFeature = defineBuddyFeature({
  id: "obsidian-vault",
  tools: [],
  skills: [obsidianSkill],
  subagents: [],
  surfaces: [],
})
