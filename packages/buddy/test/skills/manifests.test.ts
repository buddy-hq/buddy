import { describe, expect, spyOn, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import {
  loadBuddySkillManifest,
  resolveSkillPresentation,
} from "../../src/learning/skill-management/service/manifests"
import { temporaryDirectory, type TemporaryDirectory } from "../helpers/temporary-directory"

const VALID_MANIFEST = `interface:
  display_name: "Explain"
  short_description: "Teach a concept clearly before moving into application"
`

async function createSkillDirectory(): Promise<TemporaryDirectory> {
  return temporaryDirectory({ prefix: "buddy-skill-manifest-" })
}

async function writeManifest(skillDirectory: string, content: string): Promise<void> {
  const manifestPath = path.join(skillDirectory, "agents", "buddy.yaml")
  await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
  await fsp.writeFile(manifestPath, content, "utf8")
}

describe("Buddy skill manifests", () => {
  test("loads valid presentation metadata", async () => {
    await using skillDirectory = await createSkillDirectory()
    await writeManifest(skillDirectory.path, VALID_MANIFEST)

    expect(await loadBuddySkillManifest(skillDirectory.path)).toEqual({
      interface: {
        display_name: "Explain",
        short_description: "Teach a concept clearly before moving into application",
      },
    })
  })

  test("warns once and returns undefined for a missing manifest", async () => {
    await using skillDirectory = await createSkillDirectory()
    const warning = spyOn(console, "warn").mockImplementation(() => undefined)

    try {
      expect(await loadBuddySkillManifest(skillDirectory.path)).toBeUndefined()
      expect(await loadBuddySkillManifest(skillDirectory.path)).toBeUndefined()
      expect(warning).toHaveBeenCalledTimes(1)
    } finally {
      warning.mockRestore()
    }
  })

  test("rejects malformed YAML and unknown fields", async () => {
    await using malformedDirectory = await createSkillDirectory()
    await using unknownFieldDirectory = await createSkillDirectory()
    await writeManifest(malformedDirectory.path, "interface: [")
    await writeManifest(unknownFieldDirectory.path, `${VALID_MANIFEST}  brand_color: "#3B82F6"\n`)
    const warning = spyOn(console, "warn").mockImplementation(() => undefined)

    try {
      expect(await loadBuddySkillManifest(malformedDirectory.path)).toBeUndefined()
      expect(await loadBuddySkillManifest(unknownFieldDirectory.path)).toBeUndefined()
      expect(warning).toHaveBeenCalledTimes(2)
    } finally {
      warning.mockRestore()
    }
  })

  test("resolves manifest presentation with frontmatter fallback", async () => {
    await using skillDirectory = await createSkillDirectory()
    await writeManifest(skillDirectory.path, VALID_MANIFEST)
    const manifest = await loadBuddySkillManifest(skillDirectory.path)

    expect(
      resolveSkillPresentation({
        name: "explain",
        description: "Runtime description.",
        manifest,
      }),
    ).toEqual({
      displayName: "Explain",
      shortDescription: "Teach a concept clearly before moving into application",
    })
    expect(
      resolveSkillPresentation({
        name: "custom-skill",
        description: "Custom runtime description.",
        manifest: undefined,
      }),
    ).toEqual({
      displayName: "custom-skill",
      shortDescription: "Custom runtime description.",
    })
  })
})
