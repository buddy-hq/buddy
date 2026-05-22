import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { Config } from "@buddy/backend/config"
import { loadVisibleSkills } from "../../src/learning/skill-management/service/discovery"
import { tmpdir } from "../helpers/tmpdir"

function writeSkill(root: string, name: string, description: string) {
  const skillDirectory = path.join(root, name)
  mkdirSync(skillDirectory, { recursive: true })
  writeFileSync(
    path.join(skillDirectory, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${description}`,
      "---",
      "",
      `# ${name}`,
      "",
      description,
      "",
    ].join("\n"),
  )
}

afterEach(async () => {
  await Config.updateGlobal({})
})

describe("PI skill visibility", () => {
  test("keeps project-enabled vendor skills visible even when the global default is disabled", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        skills_external_vendor_roots_enabled: true,
      },
    })
    await Config.updateGlobal({
      skills_external_vendor_roots_enabled: false,
    })

    const vendorRoot = path.join(project.path, ".agents", "skills")
    writeSkill(vendorRoot, "vendor-helper", "Project vendor skill")

    const skills = await loadVisibleSkills(project.path, {
      refresh: true,
    })

    expect(skills.map((skill) => skill.name)).toContain("vendor-helper")
  })

  test("uses refresh to discover newly added project vendor skills", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        skills_external_vendor_roots_enabled: true,
      },
    })

    const vendorRoot = path.join(project.path, ".agents", "skills")
    const initial = await loadVisibleSkills(project.path, {
      refresh: true,
    })

    writeSkill(vendorRoot, "late-vendor-skill", "Loaded after the initial cache fill")

    const cached = await loadVisibleSkills(project.path)
    const refreshed = await loadVisibleSkills(project.path, {
      refresh: true,
    })

    expect(initial.map((skill) => skill.name)).not.toContain("late-vendor-skill")
    expect(cached.map((skill) => skill.name)).not.toContain("late-vendor-skill")
    expect(refreshed.map((skill) => skill.name)).toContain("late-vendor-skill")
  })
})
