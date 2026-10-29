import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { evaluatePermission } from "@buddy/transcript-contract/permission-rules"
import { Config } from "../../src/config/config"
import { Global } from "../../src/storage"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"
import { isWithinDirectory } from "../../src/config/store/directories"
import { resolveNotesDirectoryState } from "../../src/notes/settings"
import { resolveBuddyHomeState } from "../../src/project/buddy-home"

afterEach(closeAgentRuntime)

describe("notebook file permissions", () => {
  test("preserves v2 file defaults and notes read/approval policy at a nested Location", async () => {
    await using repo = await createGitRepo("notebook-notes-permissions")
    const nested = path.join(repo.path, "nested")
    await import("node:fs/promises").then((fs) => fs.mkdir(nested))
    const global = await Config.getGlobal()
    const notes = resolveNotesDirectoryState({
      buddyHomeDirectory: resolveBuddyHomeState(global.notebook_home).resolvedPath,
      configuredDirectory: global.notes_directory,
    }).resolvedDirectory
    writeProjectConfig(repo.path, JSON.stringify({ permission: { bash: "allow" } }))
    await syncOpenCodeProjectConfig(nested)
    const runtime = await getAgentRuntime()
    const rules = await runtime.catalog.agentRules(nested, "buddy")
    expect(evaluatePermission("read", ".env", rules).action).toBe("ask")
    expect(evaluatePermission("read", ".env.example", rules).action).toBe("allow")
    expect(
      evaluatePermission("external_directory", path.join(notes, "lesson.md"), rules).action,
    ).toBe("allow")
    expect(evaluatePermission("read", path.join(notes, "lesson.md"), rules).action).toBe("allow")
    expect(evaluatePermission("edit", path.join(notes, "lesson.md"), rules).action).toBe("ask")
    expect(
      evaluatePermission("edit", path.relative(nested, path.join(notes, "lesson.md")), rules)
        .action,
    ).toBe("ask")
    expect(
      evaluatePermission("shell", `echo > ${path.join(notes, "lesson.md")}`, rules).action,
    ).toBe("allow")
    expect(
      evaluatePermission(
        "external_directory",
        path.join(Global.Path.home, "unrelated", "file.md"),
        rules,
      ).action,
    ).toBe("ask")
  })

  test("matches Windows paths case-insensitively and rejects sibling prefix containment", () => {
    expect(
      evaluatePermission(
        "edit",
        "c:\\NOTES\\lesson.md",
        [{ permission: "edit", pattern: "C:/notes/*", action: "ask" }],
        "win32",
      ).action,
    ).toBe("ask")
    expect(
      evaluatePermission(
        "read",
        "c:\\NOTES\\lesson.md",
        [{ permission: "read", pattern: "C:/notes/*", action: "allow" }],
        "win32",
      ).action,
    ).toBe("allow")
    expect(isWithinDirectory("C:\\notes", "C:\\notes\\lesson.md", path.win32)).toBe(true)
    expect(isWithinDirectory("C:\\notes", "C:\\notes-other\\lesson.md", path.win32)).toBe(false)
    expect(isWithinDirectory("C:\\notes", "D:\\notes\\lesson.md", path.win32)).toBe(false)
    expect(isWithinDirectory("/notes", "/notes-other/lesson.md", path.posix)).toBe(false)
  })
})
