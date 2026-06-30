import { describe, expect, spyOn, test } from "bun:test"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  loadBuddySkillManifest,
  resolveSkillPresentation,
} from "../../src/learning/skill-management/service/manifests"

const VALID_MANIFEST = `interface:
  display_name: "Explain"
  short_description: "Teach a concept clearly before moving into application"
`

async function createSkillDirectory(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), "buddy-skill-manifest-"))
}

async function writeManifest(skillDirectory: string, content: string): Promise<void> {
  const manifestPath = path.join(skillDirectory, "agents", "buddy.yaml")
  await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
  await fsp.writeFile(manifestPath, content, "utf8")
}

describe("Buddy skill manifests", () => {
  test("loads valid presentation metadata", async () => {
    const skillDirectory = await createSkillDirectory()
    await writeManifest(skillDirectory, VALID_MANIFEST)

    expect(await loadBuddySkillManifest(skillDirectory)).toEqual({
      interface: {
        display_name: "Explain",
        short_description: "Teach a concept clearly before moving into application",
      },
    })
  })

  test("warns once and returns undefined for a missing manifest", async () => {
    const skillDirectory = await createSkillDirectory()
    const warning = spyOn(console, "warn").mockImplementation(() => undefined)

    try {
      expect(await loadBuddySkillManifest(skillDirectory)).toBeUndefined()
      expect(await loadBuddySkillManifest(skillDirectory)).toBeUndefined()
      expect(warning).toHaveBeenCalledTimes(1)
    } finally {
      warning.mockRestore()
    }
  })

  test("rejects malformed YAML and unknown fields", async () => {
    const malformedDirectory = await createSkillDirectory()
    const unknownFieldDirectory = await createSkillDirectory()
    await writeManifest(malformedDirectory, "interface: [")
    await writeManifest(unknownFieldDirectory, `${VALID_MANIFEST}  brand_color: "#3B82F6"\n`)
    const warning = spyOn(console, "warn").mockImplementation(() => undefined)

    try {
      expect(await loadBuddySkillManifest(malformedDirectory)).toBeUndefined()
      expect(await loadBuddySkillManifest(unknownFieldDirectory)).toBeUndefined()
      expect(warning).toHaveBeenCalledTimes(2)
    } finally {
      warning.mockRestore()
    }
  })

  test("resolves manifest presentation with frontmatter fallback", async () => {
    const skillDirectory = await createSkillDirectory()
    await writeManifest(skillDirectory, VALID_MANIFEST)
    const manifest = await loadBuddySkillManifest(skillDirectory)

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
