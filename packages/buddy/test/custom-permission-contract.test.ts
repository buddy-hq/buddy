import { describe, expect, test } from "bun:test"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Config } from "../src/config/config.js"

describe("custom permission contract", () => {
  test("must accept curriculum_read and curriculum_update custom permissions", async () => {
    const customPermissionConfig = {
      curriculum_read: "allow",
      curriculum_update: "allow",
    }

    const parsed = Config.Permission.parse(customPermissionConfig)

    expect(parsed).toHaveProperty("curriculum_read")
    expect(parsed).toHaveProperty("curriculum_update")

    const ruleset = PermissionNext.fromConfig(parsed)

    const curriculumReadRule = ruleset.find((r) => r.permission === "curriculum_read")
    const curriculumUpdateRule = ruleset.find((r) => r.permission === "curriculum_update")

    expect(curriculumReadRule).toBeDefined()
    expect(curriculumReadRule?.action).toBe("allow")
    expect(curriculumUpdateRule).toBeDefined()
    expect(curriculumUpdateRule?.action).toBe("allow")
  })

  test("must accept curriculum_read with pattern-based rules", async () => {
    const customPermissionConfig = {
      curriculum_read: {
        ".buddy/curriculum.md": "allow",
        ".buddy/**/*.md": "ask",
      },
    }

    const parsed = Config.Permission.parse(customPermissionConfig)

    expect(parsed).toHaveProperty("curriculum_read")
    expect(typeof parsed.curriculum_read).toBe("object")

    const ruleset = PermissionNext.fromConfig(parsed)

    const curriculumReadRules = ruleset.filter((r) => r.permission === "curriculum_read")
    expect(curriculumReadRules.length).toBeGreaterThanOrEqual(2)
  })

  test("custom permissions must survive round-trip through Config.Permission parsing", async () => {
    const input = {
      curriculum_read: "ask",
      curriculum_update: "deny",
      other_standard_permission: "allow",
    }

    const parsed = Config.Permission.parse(input)
    const reParsed = Config.Permission.parse(parsed)

    expect(reParsed.curriculum_read).toBe("ask")
    expect(reParsed.curriculum_update).toBe("deny")
    expect(reParsed.other_standard_permission).toBe("allow")
  })
})
