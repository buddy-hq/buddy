import { describe, expect, test } from "bun:test"
import {
  isResourceLocalSlashCommandName,
  parseResourceLocalSlashCommand,
  RESOURCE_COMMAND_PANEL,
} from "../src/lib/resource-commands"

describe("resource slash commands", () => {
  test("recognizes the local resource command names", () => {
    expect(isResourceLocalSlashCommandName("resources")).toBe(true)
    expect(isResourceLocalSlashCommandName("resource")).toBe(true)
    expect(isResourceLocalSlashCommandName("other")).toBe(false)
  })

  test("parses the resources panel command", () => {
    expect(parseResourceLocalSlashCommand("/resources")).toEqual({
      type: RESOURCE_COMMAND_PANEL,
    })
  })

  test("parses resource add, rebuild, remove, and use commands", () => {
    expect(parseResourceLocalSlashCommand("/resource add docs/book.pdf as book")).toEqual({
      type: "add",
      path: "docs/book.pdf",
      alias: "book",
    })
    expect(parseResourceLocalSlashCommand("/resource rebuild book")).toEqual({
      type: "rebuild",
      key: "book",
    })
    expect(parseResourceLocalSlashCommand("/resource remove resource-1")).toEqual({
      type: "remove",
      key: "resource-1",
    })
    expect(parseResourceLocalSlashCommand("/resource use book Explain this resource")).toEqual({
      type: "use",
      key: "book",
      prompt: "Explain this resource",
    })
  })
})
