import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { BuddySkill } from "../../src/learning/runtime/define-buddy-skill"
import { DISABLED_BUNDLED_SKILL_NAMES } from "../../src/learning/skill-management/disabled-bundled-skills"
import {
  ensureSystemSkillsInstalled,
  refreshSystemSkillPack,
  resetSystemSkillPackStoresForTests,
} from "../../src/learning/skill-management/service/system-installer"
import {
  buildSystemSkillPack,
  buildBundledSystemSkillPack,
  parseSystemSkillPack,
  systemSkillPackCompatibilityFromPack,
} from "../../src/learning/skill-management/service/system-pack"
import { managedSystemRoot } from "../../src/learning/skill-management/service/paths"
import { renderBuddySkillManifest } from "../../src/learning/skill-management/service/manifests"
import { BUDDY_ENV } from "../../src/storage/constants"
import { temporaryDirectory, type TemporaryDirectory } from "../helpers/temporary-directory"
import { temporaryEnvironment } from "../helpers/temporary-environment"

function registeredSkill(documentPath: string): BuddySkill {
  return {
    url: pathToFileURL(documentPath),
    name: "explain-test",
    description: "Explain test concepts.",
    presentation: {
      displayName: "Explain Test",
      shortDescription: "Explain test concepts with a focused system workflow",
    },
  }
}

type SystemSkillFixture = TemporaryDirectory & {
  sourceRoot: string
  documentPath: string
  skill: BuddySkill
}

async function fixture(): Promise<SystemSkillFixture> {
  const root = await temporaryDirectory({ prefix: "buddy-system-pack-" })

  try {
    const sourceRoot = path.join(root.path, "source")
    const skillRoot = path.join(sourceRoot, "explain-test")
    const documentPath = path.join(skillRoot, "SKILL.md")
    const disabledSkillName = DISABLED_BUNDLED_SKILL_NAMES[0]
    const disabledSkillRoot = path.join(sourceRoot, disabledSkillName)
    await fsp.mkdir(path.join(skillRoot, "references"), { recursive: true })
    await fsp.mkdir(disabledSkillRoot, { recursive: true })
    await Promise.all([
      fsp.writeFile(
        documentPath,
        `---\nname: explain-test\ndescription: Explain test concepts.\n---\n\nUse this workflow.\n`,
        "utf8",
      ),
      fsp.writeFile(path.join(skillRoot, "references", "guide.md"), "# Guide\n", "utf8"),
      fsp.writeFile(
        path.join(skillRoot, "index.ts"),
        "throw new Error('not runtime content')\n",
        "utf8",
      ),
      fsp.writeFile(
        path.join(disabledSkillRoot, "SKILL.md"),
        `---\nname: ${disabledSkillName}\ndescription: Disabled test skill.\n---\n\nDo not pack this skill.\n`,
        "utf8",
      ),
    ])
    return {
      path: root.path,
      sourceRoot,
      documentPath,
      skill: registeredSkill(documentPath),
      [Symbol.asyncDispose]: () => root[Symbol.asyncDispose](),
    }
  } catch (error) {
    await root[Symbol.asyncDispose]()
    throw error
  }
}

describe("system skill packs", () => {
  test("builds a deterministic runtime-only pack with typed presentation metadata", async () => {
    await using input = await fixture()
    const pack = await buildBundledSystemSkillPack({
      roots: [input.sourceRoot],
      skills: [input.skill],
    })
    const parsed = parseSystemSkillPack(pack, {
      baseFingerprint: pack.contentFingerprint,
      runtimeContractVersion: pack.runtimeContractVersion,
      skillNames: [input.skill.name],
      skillManifests: new Map([
        [input.skill.name, renderBuddySkillManifest(input.skill.presentation)],
      ]),
    })
    const paths = parsed.skills[0]?.files.map((file) => file.path)

    expect(paths).toContain("SKILL.md")
    expect(paths).toContain("references/guide.md")
    expect(paths).toContain("agents/buddy.yaml")
    expect(paths).not.toContain("index.ts")
    expect(parsed.skills.map((skill) => skill.name)).toEqual([input.skill.name])
    expect(() =>
      parseSystemSkillPack(pack, {
        baseFingerprint: pack.contentFingerprint,
        runtimeContractVersion: pack.runtimeContractVersion,
        skillNames: [input.skill.name],
        skillManifests: new Map([[input.skill.name, "interface: {}\n"]]),
      }),
    ).toThrow("metadata does not match")
  })

  test("rejects publishing a current contract against an incompatible released baseline", async () => {
    await using input = await fixture()
    const baseline = await buildBundledSystemSkillPack({
      roots: [input.sourceRoot],
      skills: [input.skill],
    })
    const changedSkill: BuddySkill = {
      ...input.skill,
      presentation: {
        ...input.skill.presentation,
        displayName: "Renamed Explain Test",
      },
    }
    const update = await buildSystemSkillPack({
      roots: [input.sourceRoot],
      skills: [changedSkill],
      revision: 1,
      baseFingerprint: baseline.contentFingerprint,
    })

    expect(() =>
      parseSystemSkillPack(update, systemSkillPackCompatibilityFromPack(baseline)),
    ).toThrow('metadata does not match registered skill "explain-test"')
  })

  test("atomically restores a damaged managed system installation", async () => {
    await using input = await fixture()
    using environment = temporaryEnvironment({ [BUDDY_ENV.TEST_HOME]: input.path })
    void environment
    resetSystemSkillPackStoresForTests()

    try {
      await ensureSystemSkillsInstalled([input.sourceRoot], [input.skill])
      const manifestPath = path.join(managedSystemRoot(), input.skill.name, "agents", "buddy.yaml")
      await fsp.rm(manifestPath)
      let refreshCount = 0
      const refresh = await refreshSystemSkillPack([input.sourceRoot], [input.skill], {
        refreshSkillRuntime: async () => {
          refreshCount += 1
        },
      })
      const manifest = await fsp.stat(manifestPath)
      expect(refresh.changed).toBe(true)
      expect(refreshCount).toBe(1)
      expect(manifest.isFile()).toBe(true)
    } finally {
      resetSystemSkillPackStoresForTests()
    }
  })

  test("restores same-size changes to managed system skill content", async () => {
    await using input = await fixture()
    using environment = temporaryEnvironment({ [BUDDY_ENV.TEST_HOME]: input.path })
    void environment
    resetSystemSkillPackStoresForTests()

    try {
      await ensureSystemSkillsInstalled([input.sourceRoot], [input.skill])
      const guidePath = path.join(managedSystemRoot(), input.skill.name, "references", "guide.md")
      await fsp.writeFile(guidePath, "# Other\n", "utf8")

      await ensureSystemSkillsInstalled([input.sourceRoot], [input.skill])

      await expect(fsp.readFile(guidePath, "utf8")).resolves.toBe("# Guide\n")
    } finally {
      resetSystemSkillPackStoresForTests()
    }
  })
})
