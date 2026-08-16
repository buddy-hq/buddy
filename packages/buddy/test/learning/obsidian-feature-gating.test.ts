import { describe, expect, test } from "bun:test"
import { Config } from "../../src/config"
import { enabledBuddyFeatures } from "../../src/learning/access/feature-availability"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { obsidianVaultFeature } from "../../src/learning/features/obsidian-vault/feature"
import { BUDDY } from "../../src/learning/personas/buddy"

function resolveObsidianSkills(config: Config.Info) {
  return resolveSessionRuntime({
    persona: {
      id: BUDDY.id,
      features: BUDDY.features,
      defaultSurface: BUDDY.defaultSurface,
    },
    teachingWorkspaceState: "inactive",
    config,
  }).access.skills
}

describe("Obsidian feature gating", () => {
  test("requires an explicit per-notebook connection", () => {
    expect(enabledBuddyFeatures([obsidianVaultFeature], Config.Info.parse({}))).toEqual([])
    expect(
      enabledBuddyFeatures(
        [obsidianVaultFeature],
        Config.Info.parse({ obsidian_vault: { connected: false } }),
      ),
    ).toEqual([])
    expect(
      enabledBuddyFeatures(
        [obsidianVaultFeature],
        Config.Info.parse({ obsidian_vault: { connected: true } }),
      ),
    ).toEqual([obsidianVaultFeature])
  })

  test("grants the Obsidian skill only to connected notebook sessions", () => {
    expect(resolveObsidianSkills(Config.Info.parse({})).obsidian).toBeUndefined()
    expect(resolveObsidianSkills(Config.Info.parse({ obsidian_vault: { connected: true } })).obsidian).toBe(
      "allow",
    )
  })
})
