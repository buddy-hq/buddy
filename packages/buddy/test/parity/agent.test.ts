import { describe, expect, test } from "bun:test"
import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { evaluatePermission } from "@buddy/transcript-contract/permission-rules"
import { toBuddyPermissionRules } from "@buddy/opencode-adapter/gateway/permission"
import { BUDDY } from "../../src/learning/personas/buddy"
import { TEACHING_BUDDY } from "../../src/learning/personas/teaching-buddy"
import { writeProjectConfig } from "../helpers/project-config"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { parsePromptFiniteNumber, requireParsed } from "../helpers/parse"
import { withRepo } from "./helpers"

async function readAgent(host: OpenCodeHost, directory: string, id: string) {
  return (await host.agent.get({ agentID: id, location: { directory } })).data
}

function evaluate(action: string, resource: string, permissions: Parameters<typeof toBuddyPermissionRules>[0]) {
  return evaluatePermission(action, resource, toBuddyPermissionRules(permissions))
}

describe("parity.agent", () => {
  test("preserves Buddy agent defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeProjectConfig(
        directory,
        JSON.stringify({
          agent: {
            "teaching-buddy": {
              description: "patched only",
            },
          },
        }),
      )

      const teachingBuddyAgent = requireParsed(
        await withSyncedOpenCodeConfig(directory, (host) => readAgent(host, directory, "teaching-buddy")),
        "teaching-buddy agent",
      )

      expect(teachingBuddyAgent.description).toBe("patched only")
      expect(teachingBuddyAgent.mode).toBe("primary")
      const steps = parsePromptFiniteNumber(teachingBuddyAgent.steps)
      if (steps !== undefined) {
        expect(steps).toBe(8)
      }
      const teachingBuddyPrompt = requireParsed(teachingBuddyAgent.system, "teaching-buddy prompt")
      expect(teachingBuddyPrompt.length).toBeGreaterThan(0)
    })
  })

  test("preserves distinct learner and teaching prompts through runtime overlays", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async (host) => ({
        buddyAgent: await readAgent(host, directory, "buddy"),
        teachingBuddyAgent: await readAgent(host, directory, "teaching-buddy"),
      }))

      const buddyPrompt = requireParsed(result.buddyAgent?.system, "buddy prompt")
      const teachingBuddyPrompt = requireParsed(
        result.teachingBuddyAgent?.system,
        "teaching-buddy prompt",
      )

      expect(buddyPrompt.trim()).toBe(BUDDY.runtime.prompt.trim())
      expect(teachingBuddyPrompt.trim()).toBe(TEACHING_BUDDY.runtime.prompt.trim())
      expect(teachingBuddyPrompt).not.toBe(buddyPrompt)
      expect(buddyPrompt).not.toContain("## Persona: Buddy")
      expect(teachingBuddyPrompt).not.toContain("## Persona: Teaching Buddy")
    })
  }, 15_000)

  test("preserves curriculum-orchestrator defaults when applying partial overrides", async () => {
    await withRepo(async (directory) => {
      writeProjectConfig(
        directory,
        JSON.stringify({
          agent: {
            "curriculum-orchestrator": {
              description: "patched curriculum only",
            },
          },
        }),
      )

      const curriculumAgent = requireParsed(
        await withSyncedOpenCodeConfig(directory, (host) =>
          readAgent(host, directory, "curriculum-orchestrator"),
        ),
        "curriculum-orchestrator agent",
      )

      expect(curriculumAgent.description).toBe("patched curriculum only")
      expect(curriculumAgent.mode).toBe("subagent")
      const curriculumSteps = parsePromptFiniteNumber(curriculumAgent.steps)
      if (curriculumSteps !== undefined) {
        expect(curriculumSteps).toBe(8)
      }
      const curriculumPrompt = requireParsed(
        curriculumAgent.system,
        "curriculum-orchestrator prompt",
      )
      expect(curriculumPrompt.length).toBeGreaterThan(0)
      expect(evaluate("subagent", "general", curriculumAgent.permissions).action).toBe(
        "allow",
      )
    })
  })

  test("preserves wildcard permission rules when adding scoped overrides", async () => {
    await withRepo(async (directory) => {
      writeProjectConfig(
        directory,
        JSON.stringify({
          agent: {
            "teaching-buddy": {
              permission: {
                task: {
                  "notes/*": "allow",
                },
              },
            },
          },
        }),
      )

      const teachingBuddyAgent = requireParsed(
        await withSyncedOpenCodeConfig(directory, (host) => readAgent(host, directory, "teaching-buddy")),
        "teaching-buddy agent",
      )

      expect(
        evaluate("subagent", "notes/lesson.md", teachingBuddyAgent.permissions).action,
      ).toBe("allow")
      expect(
        evaluate("subagent", "tmp/scratch.md", teachingBuddyAgent.permissions).action,
      ).toBe("deny")
    })
  })

  test("derives persona task permissions from the persona catalog defaults", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async (host) => ({
        buddyAgent: await readAgent(host, directory, "buddy"),
        teachingBuddyAgent: await readAgent(host, directory, "teaching-buddy"),
      }))

      const buddyAgent = requireParsed(result.buddyAgent, "buddy agent")
      const teachingBuddyAgent = requireParsed(result.teachingBuddyAgent, "teaching-buddy agent")

      expect(
        evaluate("subagent", "curriculum-orchestrator", buddyAgent.permissions).action,
      ).toBe("deny")
      expect(evaluate("subagent", "general", buddyAgent.permissions).action).toBe("allow")
      expect(evaluate("subagent", "practice-agent", buddyAgent.permissions).action).toBe(
        "deny",
      )
      expect(
        evaluate("subagent", "question-set-author", buddyAgent.permissions).action,
      ).toBe("allow")
      expect(
        evaluate("subagent", "flashcard-author", buddyAgent.permissions).action,
      ).toBe("allow")
      expect(
        evaluate("subagent", "learner-memory-consolidator", buddyAgent.permissions)
          .action,
      ).toBe("deny")

      expect(
        evaluate("subagent", "curriculum-orchestrator", teachingBuddyAgent.permissions)
          .action,
      ).toBe("deny")
      expect(
        evaluate("subagent", "practice-agent", teachingBuddyAgent.permissions).action,
      ).toBe("deny")
      expect(
        evaluate("subagent", "assessment-agent", teachingBuddyAgent.permissions).action,
      ).toBe("deny")
      expect(
        evaluate("subagent", "question-set-author", teachingBuddyAgent.permissions)
          .action,
      ).toBe("allow")
      expect(evaluate("subagent", "general", teachingBuddyAgent.permissions).action).toBe(
        "allow",
      )
      expect(evaluate("subagent", "explore", teachingBuddyAgent.permissions).action).toBe(
        "deny",
      )
      expect(
        evaluate("subagent", "flashcard-author", teachingBuddyAgent.permissions).action,
      ).toBe("allow")
      expect(
        evaluate(
          "subagent",
          "learner-memory-consolidator",
          teachingBuddyAgent.permissions,
        ).action,
      ).toBe("deny")
    })
  })

  test("derives persona learning-tool permissions from canonical Buddy capability policy", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async (host) => ({
        buddyAgent: await readAgent(host, directory, "buddy"),
        teachingBuddyAgent: await readAgent(host, directory, "teaching-buddy"),
      }))

      const buddyAgent = requireParsed(result.buddyAgent, "buddy agent")
      const teachingBuddyAgent = requireParsed(result.teachingBuddyAgent, "teaching-buddy agent")

      expect(evaluate("search_standards", "*", buddyAgent.permissions).action).toBe(
        "allow",
      )
      expect(evaluate("render_figure", "*", buddyAgent.permissions).action).toBe(
        "allow",
      )
      expect(evaluate("python_calculator", "*", buddyAgent.permissions).action).toBe(
        "allow",
      )
      expect(
        evaluate(
          "teaching_start_lesson",
          "teaching/lesson.ts",
          buddyAgent.permissions,
        ).action,
      ).toBe("deny")
      expect(
        evaluate("python_calculator", "*", teachingBuddyAgent.permissions).action,
      ).toBe("allow")
    })
  })

  test("does not leak persona subagent config into provider-facing agent options", async () => {
    await withRepo(async (directory) => {
      const result = await withSyncedOpenCodeConfig(directory, async (host) => ({
        buddyAgent: await readAgent(host, directory, "buddy"),
        teachingBuddyAgent: await readAgent(host, directory, "teaching-buddy"),
      }))

      const agents = [
        requireParsed(result.buddyAgent, "buddy agent"),
        requireParsed(result.teachingBuddyAgent, "teaching-buddy agent"),
      ]

      for (const agent of agents) {
        expect(agent.request.body.subagents).toBeUndefined()
      }
    })
  })
})
