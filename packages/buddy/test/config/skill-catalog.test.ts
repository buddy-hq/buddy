import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { NotebookDiagnostic } from "@buddy/agent-runtime/notebook-plan"
import { Config } from "../../src/config/config"
import {
  buildNotebookRuntimePlan,
  readSkillCatalog,
} from "../../src/config/runtime/notebook-runtime-plan"
import { Global } from "../../src/storage"

async function createFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-skill-catalog-"))
  const root = path.join(directory, "skills")
  await fs.mkdir(root)
  return {
    directory,
    root,
    [Symbol.asyncDispose]: () => fs.rm(directory, { recursive: true, force: true }),
  }
}

async function writeSkill(filepath: string, name: string) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  await fs.writeFile(
    filepath,
    `---\nname: ${name}\ndescription: A valid skill\n---\n\nSkill instructions\n`,
  )
}

describe("skill catalog", () => {
  test("excludes other tools' home skill roots unless the learner opts in", async () => {
    await using fixture = await createFixture()
    const vendorRoot = path.join(Global.Path.home, ".claude", "skills")
    await writeSkill(path.join(vendorRoot, "x", "SKILL.md"), "x")

    const defaultPlan = await buildNotebookRuntimePlan({
      config: Config.Info.parse({}),
      directory: fixture.directory,
    })
    expect(defaultPlan.excludedSkillRoots).toContain(await fs.realpath(vendorRoot))

    const optedInPlan = await buildNotebookRuntimePlan({
      config: Config.Info.parse({ skills_external_vendor_roots_enabled: true }),
      directory: fixture.directory,
    })
    expect(optedInPlan.excludedSkillRoots).toEqual([])
  })

  test("skips invalid YAML frontmatter with a diagnostic and retains valid skills", async () => {
    await using fixture = await createFixture()
    const validFile = path.join(fixture.root, "a", "SKILL.md")
    const brokenFile = path.join(fixture.root, "b", "SKILL.md")
    await writeSkill(validFile, "a")
    await fs.mkdir(path.dirname(brokenFile), { recursive: true })
    await fs.writeFile(
      brokenFile,
      "---\nname: b\ndescription: [unterminated\n---\n\nBroken skill\n",
    )
    const diagnostics: NotebookDiagnostic[] = []

    const skills = await readSkillCatalog([fixture.root], diagnostics)

    expect(skills).toContainEqual({
      id: "a",
      name: "a",
      path: validFile,
      description: "A valid skill",
      content: "Skill instructions",
    })
    expect(diagnostics).toEqual([
      {
        path: brokenFile,
        message: expect.stringMatching(
          /^Skipped skill: its frontmatter is not valid YAML \([^\r\n]+\)$/,
        ),
      },
    ])
  })

  test("follows linked skill directories and stops directory cycles", async () => {
    await using fixture = await createFixture()
    const target = path.join(fixture.directory, "elsewhere", "skill")
    const linked = path.join(fixture.root, "linked")
    await writeSkill(path.join(target, "SKILL.md"), "linked")
    await fs.symlink(target, linked, "junction")
    await fs.symlink(fixture.root, path.join(fixture.root, "loop"), "junction")
    const diagnostics: NotebookDiagnostic[] = []

    const skills = await readSkillCatalog([fixture.root], diagnostics)

    expect(skills).toContainEqual({
      id: "linked",
      name: "linked",
      path: path.join(linked, "SKILL.md"),
      description: "A valid skill",
      content: "Skill instructions",
    })
    expect(diagnostics).toEqual([])
  })

  test.skipIf(process.platform === "win32")("follows a linked SKILL.md file", async () => {
    await using fixture = await createFixture()
    const target = path.join(fixture.directory, "real.md")
    const linked = path.join(fixture.root, "c", "SKILL.md")
    await writeSkill(target, "c")
    await fs.mkdir(path.dirname(linked), { recursive: true })
    await fs.symlink(target, linked)
    const diagnostics: NotebookDiagnostic[] = []

    const skills = await readSkillCatalog([fixture.root], diagnostics)

    expect(skills).toContainEqual({
      id: "c",
      name: "c",
      path: linked,
      description: "A valid skill",
      content: "Skill instructions",
    })
    expect(diagnostics).toEqual([])
  })

  test("ignores broken links", async () => {
    await using fixture = await createFixture()
    await fs.symlink(
      path.join(fixture.directory, "missing"),
      path.join(fixture.root, "gone"),
      "junction",
    )
    const diagnostics: NotebookDiagnostic[] = []

    const skills = await readSkillCatalog([fixture.root], diagnostics)

    expect(skills).toEqual([])
    expect(diagnostics).toEqual([])
  })
})
