import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { withRepo } from "./helpers"

function requireValue<T>(value: T | undefined, label: string): T {
  if (value !== undefined) {
    return value
  }

  throw new Error(`Missing ${label}`)
}

describe("parity.agent", () => {
  test("preserves Buddy agent defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "code-buddy": {
              description: "patched only",
            },
          },
        }),
      )

      const codeBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-buddy")),
        "code-buddy agent",
      )

      expect(codeBuddyAgent.description).toBe("patched only")
      expect(codeBuddyAgent.mode).toBe("primary")
      if (typeof codeBuddyAgent.steps === "number") {
        expect(codeBuddyAgent.steps).toBe(8)
      }
      const codeBuddyPrompt = requireValue(codeBuddyAgent.prompt, "code-buddy prompt")
      expect(typeof codeBuddyPrompt).toBe("string")
      expect(codeBuddyPrompt.length).toBeGreaterThan(0)
    })
  })

  test("preserves curriculum-orchestrator defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "curriculum-orchestrator": {
              description: "patched curriculum only",
            },
          },
        }),
      )

      const curriculumAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () =>
          OpenCodeAgent.get("curriculum-orchestrator"),
        ),
        "curriculum-orchestrator agent",
      )

      expect(curriculumAgent.description).toBe("patched curriculum only")
      expect(curriculumAgent.mode).toBe("subagent")
      if (typeof curriculumAgent.steps === "number") {
        expect(curriculumAgent.steps).toBe(8)
      }
      const curriculumPrompt = requireValue(
        curriculumAgent.prompt,
        "curriculum-orchestrator prompt",
      )
      expect(typeof curriculumPrompt).toBe("string")
      expect(curriculumPrompt.length).toBeGreaterThan(0)
    })
  })

  test("preserves wildcard permission rules when adding scoped overrides", async () => {
    await withRepo(async (directory) => {
      writeFileSync(
        path.join(directory, "buddy.jsonc"),
        JSON.stringify({
          agent: {
            "code-buddy": {
              permission: {
                task: {
                  "notes/*": "allow",
                },
              },
            },
          },
        }),
      )

      const codeBuddyAgent = requireValue(
        await withSyncedOpenCodeConfig(directory, () => OpenCodeAgent.get("code-buddy")),
        "code-buddy agent",
      )

      expect(
        PermissionNext.evaluate("task", "notes/lesson.md", codeBuddyAgent.permission).action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate("task", "tmp/scratch.md", codeBuddyAgent.permission).action,
      ).toBe("deny")
    })
  })

  test("registers math-buddy as a primary agent with inline figure permissions", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        agent: await OpenCodeAgent.get("math-buddy"),
        buddyAgent: await OpenCodeAgent.get("buddy"),
        codeBuddyAgent: await OpenCodeAgent.get("code-buddy"),
        listed: await OpenCodeAgent.list(),
      }))

      const mathBuddyAgent = requireValue(result.agent, "math-buddy agent")
      const buddyAgent = requireValue(result.buddyAgent, "buddy agent")
      const codeBuddyAgent = requireValue(result.codeBuddyAgent, "code-buddy agent")
      expect(mathBuddyAgent.mode).toBe("primary")
      expect(result.listed.map((entry) => entry.name)).toContain("math-buddy")
      expect(
        PermissionNext.evaluate("render_figure", "figures/example.svg", mathBuddyAgent.permission)
          .action,
      ).toBe("allow")
      expect(PermissionNext.evaluate("render_mermaid", "*", mathBuddyAgent.permission).action).toBe(
        "allow",
      )
      expect(PermissionNext.evaluate("render_mermaid", "*", buddyAgent.permission).action).toBe(
        "allow",
      )
      expect(PermissionNext.evaluate("render_mermaid", "*", codeBuddyAgent.permission).action).toBe(
        "allow",
      )
      expect(
        PermissionNext.evaluate("python_calculator", "*", mathBuddyAgent.permission).action,
      ).toBe("allow")
      expect(PermissionNext.evaluate("python_calculator", "*", buddyAgent.permission).action).toBe(
        "deny",
      )
      expect(
        PermissionNext.evaluate("python_calculator", "*", codeBuddyAgent.permission).action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate(
          "teaching_start_lesson",
          "teaching/lesson.ts",
          mathBuddyAgent.permission,
        ).action,
      ).toBe("deny")
    })
  })

  test("registers reading-buddy as a primary agent with reading-safe defaults", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async () => ({
        agent: await OpenCodeAgent.get("reading-buddy"),
        listed: await OpenCodeAgent.list(),
      }))

      const readingBuddyAgent = requireValue(result.agent, "reading-buddy agent")
      const readingBuddyPrompt = requireValue(readingBuddyAgent.prompt, "reading-buddy prompt")

      expect(readingBuddyAgent.mode).toBe("primary")
      expect(result.listed.map((entry) => entry.name)).toContain("reading-buddy")
      expect(readingBuddyPrompt).toContain("question-set-author")
      expect(
        PermissionNext.evaluate("render_saved_question_set", "*", readingBuddyAgent.permission)
          .action,
      ).toBe("allow")
      expect(
        PermissionNext.evaluate(
          "teaching_start_lesson",
          "teaching/lesson.ts",
          readingBuddyAgent.permission,
        ).action,
      ).toBe("deny")
      expect(
        PermissionNext.evaluate("python_calculator", "*", readingBuddyAgent.permission).action,
      ).toBe("deny")
    })
  })
})
