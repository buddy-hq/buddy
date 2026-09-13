import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { Global } from "@buddy/opencode-adapter/global"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { Truncate } from "@buddy/opencode-adapter/tool"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { projectConfigFile, writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"
import { tmpdir } from "../helpers/tmpdir"
import { Config } from "../../src/config"
import { managedSystemRoot } from "../../src/learning/skill-management/service/paths"

const EXTERNAL_DIRECTORY_PERMISSION = "external_directory"
const READ_PERMISSION = "read"
const EDIT_PERMISSION = "edit"
const SHELL_PERMISSION = "bash"
const ALLOW_ACTION = "allow"
const ASK_ACTION = "ask"

describe("config external_directory permission", () => {
  test("preserves the user's external-directory policy", async () => {
    await using repo = await createGitRepo("buddy-config-external-directory-ask")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          permission: {
            external_directory: ALLOW_ACTION,
          },
        },
        null,
        2,
      ) + "\n",
    )

    const action = await withSyncedOpenCodeConfig(repo.path, async () => {
      const agent = await OpenCodeAgent.get("buddy")
      return PermissionNext.evaluate(
        EXTERNAL_DIRECTORY_PERMISSION,
        path.join(path.dirname(repo.path), "outside", "*"),
        agent.permission,
      ).action
    })

    expect(action).toBe(ALLOW_ACTION)
  }, 30_000)

  test("allows preloaded managed system skill paths without prompting", async () => {
    await using repo = await createGitRepo("buddy-config-external-directory-skills")

    const action = await withSyncedOpenCodeConfig(repo.path, async () => {
      const agent = await OpenCodeAgent.get("buddy")
      return PermissionNext.evaluate(
        EXTERNAL_DIRECTORY_PERMISSION,
        path.join(managedSystemRoot(), "sample-skill", "SKILL.md"),
        agent.permission,
      ).action
    })

    expect(action).toBe(ALLOW_ACTION)
  }, 30_000)

  test("allows vendor tmp and tool-output paths without prompting", async () => {
    await using repo = await createGitRepo("buddy-config-external-directory-vendor-paths")

    const result = await withSyncedOpenCodeConfig(repo.path, async () => {
      const agent = await OpenCodeAgent.get("buddy")
      return {
        tmp: PermissionNext.evaluate(
          EXTERNAL_DIRECTORY_PERMISSION,
          path.join(Global.Path.tmp, "scratch"),
          agent.permission,
        ).action,
        toolOutput: PermissionNext.evaluate(
          EXTERNAL_DIRECTORY_PERMISSION,
          Truncate.GLOB,
          agent.permission,
        ).action,
      }
    })

    expect(result.tmp).toBe(ALLOW_ACTION)
    expect(result.toolOutput).toBe(ALLOW_ACTION)
  })

  test("allows note reads while keeping note writes permission-gated at runtime", async () => {
    await using repo = await createGitRepo("buddy-config-notes-permissions")
    const notesDirectory = path.join(path.dirname(repo.path), "configured-notes")

    const persistedConfig =
      JSON.stringify(
        {
          permission: {
            read: ASK_ACTION,
            edit: ALLOW_ACTION,
            bash: ALLOW_ACTION,
          },
        },
        null,
        2,
      ) + "\n"
    writeProjectConfig(repo.path, persistedConfig)

    const globalConfig = await Config.getGlobal()
    await Config.replaceGlobal({ ...globalConfig, notes_directory: notesDirectory })
    fs.mkdirSync(notesDirectory, { recursive: true })
    const canonicalNotesDirectory = fs.realpathSync(notesDirectory)
    const notesFile = path.join(canonicalNotesDirectory, "Example.md")
    const { project } = await OpenCodeProject.fromDirectory(repo.path)
    const relativeNotesDirectory = path.relative(project.worktree, canonicalNotesDirectory)
    const relativeNotesFile = path.relative(project.worktree, notesFile)
    try {
      const result = await withSyncedOpenCodeConfig(repo.path, async () => {
        const agent = await OpenCodeAgent.get("buddy")
        return {
          externalRoot: PermissionNext.evaluate(
            EXTERNAL_DIRECTORY_PERMISSION,
            canonicalNotesDirectory,
            agent.permission,
          ).action,
          external: PermissionNext.evaluate(
            EXTERNAL_DIRECTORY_PERMISSION,
            path.join(canonicalNotesDirectory, "*"),
            agent.permission,
          ).action,
          readRoot: PermissionNext.evaluate(
            READ_PERMISSION,
            relativeNotesDirectory,
            agent.permission,
          ).action,
          read: PermissionNext.evaluate(READ_PERMISSION, relativeNotesFile, agent.permission)
            .action,
          edit: PermissionNext.evaluate(EDIT_PERMISSION, relativeNotesFile, agent.permission)
            .action,
          shell: PermissionNext.evaluate(
            SHELL_PERMISSION,
            `printf note > ${notesFile}`,
            agent.permission,
          ).action,
        }
      })

      expect(result).toEqual({
        externalRoot: ALLOW_ACTION,
        external: ALLOW_ACTION,
        readRoot: ALLOW_ACTION,
        read: ALLOW_ACTION,
        edit: ASK_ACTION,
        shell: ALLOW_ACTION,
      })
      expect(JSON.parse(fs.readFileSync(projectConfigFile(repo.path), "utf8"))).toMatchObject({
        permission: {
          read: ASK_ACTION,
          edit: ALLOW_ACTION,
          bash: ALLOW_ACTION,
        },
      })
    } finally {
      await Config.replaceGlobal(globalConfig)
    }
  }, 30_000)

  test("preserves project rules across Notes-root relationships", async () => {
    const previous = await Config.getGlobal()

    try {
      for (const relationship of ["equal", "ancestor", "descendant"] as const) {
        await using repo = await createGitRepo(`buddy-config-notes-${relationship}`)
        const { project } = await OpenCodeProject.fromDirectory(repo.path)
        const notesDirectory =
          relationship === "equal"
            ? repo.path
            : relationship === "ancestor"
              ? path.dirname(repo.path)
              : path.join(repo.path, "Notes")
        const unrelatedDirectory = path.join(
          path.parse(repo.path).root,
          "buddy-config-notes-unrelated",
        )
        writeProjectConfig(
          repo.path,
          JSON.stringify(
            {
              permission: {
                external_directory: "deny",
                read: ASK_ACTION,
                edit: ALLOW_ACTION,
              },
            },
            null,
            2,
          ) + "\n",
        )
        await Config.replaceGlobal({ ...previous, notes_directory: notesDirectory })
        const canonicalNotesDirectory =
          relationship === "equal"
            ? project.worktree
            : relationship === "ancestor"
              ? path.dirname(project.worktree)
              : path.join(project.worktree, "Notes")
        const notesFile = path.join(canonicalNotesDirectory, "Vault note.md")
        const relativeNotesFile = path.relative(project.worktree, notesFile)
        const result = await withSyncedOpenCodeConfig(repo.path, async () => {
          const agent = await OpenCodeAgent.get("buddy")
          return {
            projectRead: PermissionNext.evaluate(
              READ_PERMISSION,
              "src/private.ts",
              agent.permission,
            ).action,
            projectEdit: PermissionNext.evaluate(
              EDIT_PERMISSION,
              "src/private.ts",
              agent.permission,
            ).action,
            notesExternal: PermissionNext.evaluate(
              EXTERNAL_DIRECTORY_PERMISSION,
              notesFile,
              agent.permission,
            ).action,
            notesRead: PermissionNext.evaluate(READ_PERMISSION, relativeNotesFile, agent.permission)
              .action,
            notesEdit: PermissionNext.evaluate(EDIT_PERMISSION, relativeNotesFile, agent.permission)
              .action,
            unrelatedExternal: PermissionNext.evaluate(
              EXTERNAL_DIRECTORY_PERMISSION,
              path.join(unrelatedDirectory, "private.md"),
              agent.permission,
            ).action,
          }
        })

        expect(result).toEqual({
          projectRead: ASK_ACTION,
          projectEdit: ALLOW_ACTION,
          notesExternal: ALLOW_ACTION,
          notesRead: relationship === "equal" ? ASK_ACTION : ALLOW_ACTION,
          notesEdit: relationship === "equal" ? ALLOW_ACTION : ASK_ACTION,
          unrelatedExternal: "deny",
        })
      }
    } finally {
      await Config.replaceGlobal(previous)
    }
  }, 30_000)

  test("uses the configured Notes directory independently of Buddy Home", async () => {
    await using home = await tmpdir()
    await using notes = await tmpdir()
    await using repo = await createGitRepo("buddy-config-independent-notes-home")
    const previous = await Config.getGlobal()
    await Config.replaceGlobal({
      ...previous,
      notebook_home: home.path,
      notes_directory: notes.path,
    })

    try {
      const { project } = await OpenCodeProject.fromDirectory(repo.path)
      const canonicalNotesDirectory = fs.realpathSync(notes.path)
      const relativeNotesFile = path.relative(
        project.worktree,
        path.join(canonicalNotesDirectory, "Configured.md"),
      )
      const result = await withSyncedOpenCodeConfig(repo.path, async () => {
        const agent = await OpenCodeAgent.get("buddy")
        return {
          external: PermissionNext.evaluate(
            EXTERNAL_DIRECTORY_PERMISSION,
            path.join(canonicalNotesDirectory, "Configured.md"),
            agent.permission,
          ).action,
          read: PermissionNext.evaluate(READ_PERMISSION, relativeNotesFile, agent.permission)
            .action,
          edit: PermissionNext.evaluate(EDIT_PERMISSION, relativeNotesFile, agent.permission)
            .action,
        }
      })

      expect(result).toEqual({
        external: ALLOW_ACTION,
        read: ALLOW_ACTION,
        edit: ASK_ACTION,
      })
    } finally {
      await Config.replaceGlobal(previous)
    }
  }, 30_000)

  test("forwards compaction settings into the OpenCode runtime overlay", async () => {
    await using repo = await createGitRepo("buddy-config-compaction-overlay")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          compaction: {
            auto: false,
          },
        },
        null,
        2,
      ) + "\n",
    )

    const autoCompactionEnabled = await withSyncedOpenCodeConfig(repo.path, async () => {
      const runtimeConfig = await OpenCodeConfig.get()
      return runtimeConfig.compaction?.auto
    })

    expect(autoCompactionEnabled).toBe(false)
  })
})
