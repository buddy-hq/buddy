import { describe, expect, test } from "bun:test"
import {
  getSelectableAgents,
  resolveCurrentAgent,
  resolveDefaultAgentName,
} from "../src/lib/directory-chat/agent-catalog"
import type { AgentConfigOption } from "../src/state/chat-actions"

function createAgent(input: {
  name: string
  mode?: string
  hidden?: boolean
  model?: {
    providerID: string
    modelID: string
  }
  variant?: string
}): AgentConfigOption {
  return {
    name: input.name,
    mode: input.mode,
    hidden: input.hidden,
    model: input.model,
    variant: input.variant,
  }
}

describe("agent catalog helpers", () => {
  test("only exposes visible primary agents for selection", () => {
    expect(
      getSelectableAgents([
        createAgent({ name: "build" }),
        createAgent({ name: "plan", hidden: true }),
        createAgent({ name: "explore", mode: "subagent" }),
      ]).map((agent) => agent.name),
    ).toEqual(["build"])
  })

  test("resolves the default agent from the visible primary list", () => {
    expect(
      resolveDefaultAgentName(
        [
          createAgent({ name: "build" }),
          createAgent({ name: "plan", hidden: true }),
          createAgent({ name: "explore", mode: "subagent" }),
        ],
        "plan",
      ),
    ).toBe("build")
  })

  test("ignores a restored hidden agent and falls back to the default visible agent", () => {
    const agents = [
      createAgent({ name: "build" }),
      createAgent({ name: "plan", hidden: true }),
      createAgent({ name: "explore", mode: "subagent" }),
    ]

    expect(
      resolveCurrentAgent({
        agents,
        selectedAgentName: "plan",
        defaultAgentName: "build",
      })?.name,
    ).toBe("build")
  })
})
