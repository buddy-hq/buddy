import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Config } from "@buddy/backend/config"
import { resolveBuddySkillPaths } from "../../src/config/skills/paths"
import { managedSkillsRoot, managedSystemRoot } from "../../src/learning/skill-management/service/paths"
import { tmpdir } from "../helpers/tmpdir"

describe("skill path resolution", () => {
  test("avoids duplicate bundled source and nested managed system roots", async () => {
    await using project = await tmpdir({ git: true })

    const paths = (await resolveBuddySkillPaths(await Config.getProject(project.path), project.path)) ?? []

    expect(paths).toContain(managedSkillsRoot())
    expect(paths).not.toContain(managedSystemRoot())
    expect(
      paths.some((entry) =>
        entry.includes(path.join("packages", "buddy", "src", "learning", "features")),
      ),
    ).toBe(false)
  })
})
