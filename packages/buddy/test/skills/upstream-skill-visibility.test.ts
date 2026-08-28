import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Skill as OpenCodeSkill } from "@buddy/opencode-adapter/skill"
import { listSkillsCatalog } from "../../src/learning/skill-management"
import { isSuppressedOpenCodeSkill } from "../../src/opencode-runtime/hidden-opencode-skills"
import { tmpdir } from "../helpers/tmpdir"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"

const CUSTOMIZE_OPENCODE_SKILL_NAME = "customize-opencode" as const
const OPENCODE_BUILT_IN_LOCATION = "<built-in>" as const
const PROJECT_LOCAL_CUSTOMIZE_OPENCODE_LOCATION =
  "/project/.opencode/skills/customize-opencode" as const

function writeProjectCustomizeOpencodeSkill(directory: string) {
  const skillDirectory = path.join(directory, ".opencode", "skills", CUSTOMIZE_OPENCODE_SKILL_NAME)
  mkdirSync(skillDirectory, { recursive: true })
  writeFileSync(
    path.join(skillDirectory, "SKILL.md"),
    [
      "---",
      `name: ${CUSTOMIZE_OPENCODE_SKILL_NAME}`,
      "description: Project-local customize-opencode override for Buddy tests.",
      "---",
      "",
      "# Project override",
      "",
      "This is a user-defined skill, not the upstream built-in.",
      "",
    ].join("\n"),
  )
}

describe("upstream skill visibility", () => {
  test("isSuppressedOpenCodeSkill hides the built-in customize-opencode skill only", () => {
    expect(
      isSuppressedOpenCodeSkill({
        name: CUSTOMIZE_OPENCODE_SKILL_NAME,
        location: OPENCODE_BUILT_IN_LOCATION,
      }),
    ).toBe(true)
    expect(
      isSuppressedOpenCodeSkill({
        name: CUSTOMIZE_OPENCODE_SKILL_NAME,
        location: PROJECT_LOCAL_CUSTOMIZE_OPENCODE_LOCATION,
      }),
    ).toBe(false)
  })

  test("hides the built-in customize-opencode skill from the Buddy catalog", async () => {
    try {
      await using project = await tmpdir({ git: true })

      const catalog = await listSkillsCatalog(project.path, { refresh: true })

      expect(catalog.installed.map((skill) => skill.name)).not.toContain(
        CUSTOMIZE_OPENCODE_SKILL_NAME,
      )
    } finally {
      await OpenCodeInstance.disposeAll()
    }
  })

  test("keeps a user-defined customize-opencode skill visible", async () => {
    try {
      await using project = await tmpdir({ git: true })
      writeProjectCustomizeOpencodeSkill(project.path)

      const catalog = await listSkillsCatalog(project.path, { refresh: true })
      const skill = catalog.installed.find((entry) => entry.name === CUSTOMIZE_OPENCODE_SKILL_NAME)

      expect(skill).toBeDefined()
      expect(skill?.location).toContain(
        path.join(".opencode", "skills", CUSTOMIZE_OPENCODE_SKILL_NAME),
      )
    } finally {
      await OpenCodeInstance.disposeAll()
    }
  })

  test("removes the suppressed built-in skill from the runtime available skill list", async () => {
    try {
      await using project = await tmpdir({ git: true })

      const availableSkills = await withSyncedOpenCodeConfig(project.path, async () => {
        const agent = await OpenCodeAgent.get("buddy")
        if (!agent) {
          throw new Error('Missing "buddy" agent')
        }
        return OpenCodeSkill.available(agent)
      })

      expect(availableSkills.map((skill) => skill.name)).not.toContain(
        CUSTOMIZE_OPENCODE_SKILL_NAME,
      )
    } finally {
      await OpenCodeInstance.disposeAll()
    }
  }, 20_000)
})
