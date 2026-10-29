import { describe, expect, test } from "bun:test"
import { evaluatePermission } from "@buddy/transcript-contract/permission-rules"
import { toBuddyPermissionRules } from "@buddy/transcript-contract/permission-rules"
import { createGitRepo } from "../helpers/repo"
import { createNotebookTestHost } from "../helpers/opencode"
import { writeProjectConfig } from "../helpers/project-config"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"

describe("Buddy subagent catalog", () => {
  test("registers seven native subagent roles and keeps configured fields scoped on reload", async () => {
    await using first = await createGitRepo("subagent-catalog-first")
    await using second = await createGitRepo("subagent-catalog-second")
    writeProjectConfig(
      first.path,
      JSON.stringify({
        agent: {
          "goal-writer": {
            mode: "primary",
            prompt: "Notebook goal instructions",
            model: "scripted/author",
          },
          "learner-memory-consolidator": { hidden: false },
        },
      }),
    )
    await using runtime = await createNotebookTestHost()
    for (const directory of [first.path, second.path])
      await syncNotebookRuntimeConfig(directory, { runtime: runtime.agentRuntime })
    const agents = (await runtime.host.agent.list({ location: { directory: first.path } })).data
    const roles = [
      "assessment-agent",
      "practice-agent",
      "goal-writer",
      "curriculum-orchestrator",
      "question-set-author",
      "flashcard-author",
      "learner-memory-consolidator",
    ]
    for (const id of roles) {
      const agent = agents.find((entry) => entry.id === id)
      expect(agent?.mode).toBe("subagent")
      expect(agent?.system?.length).toBeGreaterThan(20)
    }
    expect(agents.find((entry) => entry.id === "buddy")?.mode).toBe("primary")
    const primaryRules = toBuddyPermissionRules(
      agents.find((entry) => entry.id === "buddy")?.permissions ?? [],
    )
    expect(evaluatePermission("save_question_set", "*", primaryRules).action).toBe("deny")
    expect(evaluatePermission("save_flashcard_deck", "*", primaryRules).action).toBe("deny")
    expect(
      evaluatePermission(
        "save_question_set",
        "*",
        toBuddyPermissionRules(
          agents.find((entry) => entry.id === "question-set-author")?.permissions ?? [],
        ),
      ).action,
    ).toBe("allow")
    expect(
      evaluatePermission(
        "save_flashcard_deck",
        "*",
        toBuddyPermissionRules(
          agents.find((entry) => entry.id === "flashcard-author")?.permissions ?? [],
        ),
      ).action,
    ).toBe("allow")
    expect(agents.find((entry) => entry.id === "goal-writer")).toMatchObject({
      system: "Notebook goal instructions",
      model: { providerID: "scripted", id: "author" },
    })
    expect(agents.find((entry) => entry.id === "learner-memory-consolidator")?.hidden).toBe(true)
    expect(
      (
        await runtime.host.agent.get({
          location: { directory: second.path },
          agentID: "goal-writer",
        })
      ).data.model,
    ).toBeUndefined()
    const before = agents.find((entry) => entry.id === "question-set-author")?.permissions ?? []
    await syncNotebookRuntimeConfig(first.path, { force: true, runtime: runtime.agentRuntime })
    expect(
      (
        await runtime.host.agent.get({
          location: { directory: first.path },
          agentID: "question-set-author",
        })
      ).data.permissions,
    ).toEqual(before)
  })
})
