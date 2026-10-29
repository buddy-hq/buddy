import { expect, test } from "bun:test"
import type { OpenCodeClient } from "@opencode/client"
import { listExecutableCommands } from "../src/gateway/command"

test("hides the init runtime command while retaining other commands and skills named init", async () => {
  const location = { directory: "/notebook" }
  const client = {
    command: {
      async list() {
        return { location, data: [
          { name: "init", description: "guided AGENTS.md setup" },
          { name: "review", description: "Review changes" },
        ] }
      },
    },
    skill: {
      async list() {
        return { location, data: [
          { id: "init", name: "Initialize learning", description: "Start a lesson", path: "/notebook/init.md", content: "Begin a lesson" },
          { id: "summarize", name: "Summarize", description: "Summarize a lesson", path: "/notebook/summarize.md", content: "Summarize the lesson" },
        ] }
      },
    },
  } satisfies Pick<OpenCodeClient, "command" | "skill">

  expect(await listExecutableCommands(client, location.directory)).toEqual([
    { name: "review", description: "Review changes", source: "command" },
    { name: "init", description: "Start a lesson", source: "skill" },
    { name: "summarize", description: "Summarize a lesson", source: "skill" },
  ])
})
