import { describe, expect, test } from "bun:test"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Config } from "../src/config/config.js"

describe("custom permission contract", () => {
  test("must accept curriculum_read, curriculum_update, render_figure, and render_freeform_figure custom permissions", async () => {
    const customPermissionConfig = {
      curriculum_read: "allow",
      curriculum_update: "allow",
      render_figure: "allow",
      render_freeform_figure: "allow",
    }

    const parsed = Config.Permission.parse(customPermissionConfig)

    expect(parsed).toHaveProperty("curriculum_read")
    expect(parsed).toHaveProperty("curriculum_update")
    expect(parsed).toHaveProperty("render_figure")
    expect(parsed).toHaveProperty("render_freeform_figure")

    const ruleset = PermissionNext.fromConfig(parsed)
    const customRuleActions = new Map(
      ruleset
        .filter((rule) =>
          rule.permission === "curriculum_read" ||
          rule.permission === "curriculum_update" ||
          rule.permission === "render_figure" ||
          rule.permission === "render_freeform_figure")
        .map((rule) => [rule.permission, rule.action]),
    )

    expect(customRuleActions.get("curriculum_read")).toBe("allow")
    expect(customRuleActions.get("curriculum_update")).toBe("allow")
    expect(customRuleActions.get("render_figure")).toBe("allow")
    expect(customRuleActions.get("render_freeform_figure")).toBe("allow")
  })

  test("must accept curriculum_read with pattern-based rules", async () => {
    const customPermissionConfig = {
      curriculum_read: {
        ".buddy/context.json": "allow",
        ".buddy/**": "ask",
      },
    }

    const parsed = Config.Permission.parse(customPermissionConfig)

    expect(parsed).toHaveProperty("curriculum_read")
    expect(typeof parsed.curriculum_read).toBe("object")

    const ruleset = PermissionNext.fromConfig(parsed)
    const curriculumReadRules = ruleset.filter((rule) => rule.permission === "curriculum_read")
    const byPattern = new Map(curriculumReadRules.map((rule) => [rule.pattern, rule.action]))

    expect(byPattern.get(".buddy/context.json")).toBe("allow")
    expect(byPattern.get(".buddy/**")).toBe("ask")
  })

  test("custom permissions must survive round-trip through Config.Permission parsing", async () => {
    const input = {
      curriculum_read: "ask",
      curriculum_update: "deny",
      render_figure: "allow",
      render_freeform_figure: "ask",
      other_standard_permission: "allow",
    }

    const parsed = Config.Permission.parse(input)
    const reParsed = Config.Permission.parse(parsed)

    expect(reParsed.curriculum_read).toBe("ask")
    expect(reParsed.curriculum_update).toBe("deny")
    expect(reParsed.render_figure).toBe("allow")
    expect(reParsed.render_freeform_figure).toBe("ask")
    expect(reParsed.other_standard_permission).toBe("allow")
  })
})
