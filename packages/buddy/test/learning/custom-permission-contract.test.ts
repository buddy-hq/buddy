import { describe, expect, test } from "bun:test"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Config } from "@buddy/backend/config"

describe("custom permission contract", () => {
  test("must accept curriculum_read, learner_snapshot_read, python_calculator, render_figure, and render_freeform_figure custom permissions", async () => {
    const customPermissionConfig = {
      curriculum_read: "allow",
      learner_snapshot_read: "allow",
      python_calculator: "allow",
      render_figure: "allow",
      render_freeform_figure: "allow",
    }

    const parsed = Config.Permission.parse(customPermissionConfig)

    expect(parsed).toHaveProperty("curriculum_read")
    expect(parsed).toHaveProperty("learner_snapshot_read")
    expect(parsed).toHaveProperty("python_calculator")
    expect(parsed).toHaveProperty("render_figure")
    expect(parsed).toHaveProperty("render_freeform_figure")

    const ruleset = PermissionNext.fromConfig(parsed)
    const customRuleActions = new Map(
      ruleset
        .filter(
          (rule) =>
            rule.permission === "curriculum_read" ||
            rule.permission === "learner_snapshot_read" ||
            rule.permission === "python_calculator" ||
            rule.permission === "render_figure" ||
            rule.permission === "render_freeform_figure",
        )
        .map((rule) => [rule.permission, rule.action]),
    )

    expect(customRuleActions.get("curriculum_read")).toBe("allow")
    expect(customRuleActions.get("learner_snapshot_read")).toBe("allow")
    expect(customRuleActions.get("python_calculator")).toBe("allow")
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
      learner_snapshot_read: "deny",
      python_calculator: "allow",
      render_figure: "allow",
      render_freeform_figure: "ask",
      other_standard_permission: "allow",
    }

    const parsed = Config.Permission.parse(input)
    const reParsed = Config.Permission.parse(parsed)

    expect(reParsed.curriculum_read).toBe("ask")
    expect(reParsed.learner_snapshot_read).toBe("deny")
    expect(reParsed.python_calculator).toBe("allow")
    expect(reParsed.render_figure).toBe("allow")
    expect(reParsed.render_freeform_figure).toBe("ask")
    expect(reParsed.other_standard_permission).toBe("allow")
  })
})
