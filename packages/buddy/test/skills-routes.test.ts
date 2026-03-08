import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { app } from "../src/index.ts"
import { Config } from "../src/config/config.js"
import { Global } from "../src/storage/global.js"

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createGitRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), "# test\n")
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

describe("skills routes", () => {
  test("lists, installs, toggles, creates, and removes skills", async () => {
    const repo = createGitRepo("buddy-route-skills")
    const localSkillDir = path.join(repo, ".agents", "skills", "local-review")
    const staleSkillDir = path.join(repo, ".agents", "skills", "stale-skill")
    fs.mkdirSync(localSkillDir, {
      recursive: true,
    })
    fs.mkdirSync(staleSkillDir, {
      recursive: true,
    })
    writeFileSync(
      path.join(localSkillDir, "SKILL.md"),
      `---
name: local-review
description: Workspace-local review workflow.
---

Use the local review workflow for this repository.
`,
    )
    writeFileSync(
      path.join(staleSkillDir, "SKILL.md"),
      `---
name: stale-skill
description: Workspace skill before a manual rename.
---

Use the stale skill before refresh.
`,
    )
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), "buddy-skills-home-"))
    const previousHome = process.env.HOME
    const previousBuddyHome = process.env.BUDDY_TEST_HOME
    const previousCodexHome = process.env.CODEX_HOME
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    const previousGlobal = fs.existsSync(globalFile) ? fs.readFileSync(globalFile, "utf8") : undefined

    process.env.HOME = fakeHome
    process.env.BUDDY_TEST_HOME = fakeHome
    process.env.CODEX_HOME = path.join(fakeHome, ".codex")

    fs.rmSync(path.join(fakeHome, ".codex"), {
      recursive: true,
      force: true,
    })
    fs.rmSync(globalFile, {
      force: true,
    })

    try {
      const codexSkillDir = path.join(fakeHome, ".codex", "skills", "codex-helper")
      fs.mkdirSync(codexSkillDir, {
        recursive: true,
      })
      writeFileSync(
        path.join(codexSkillDir, "SKILL.md"),
        `---
name: codex-helper
description: Skill discovered from CODEX_HOME.
---

Use the Codex helper skill when testing overlay-backed skill paths.
`,
      )

      const listBefore = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo,
        },
      })

      expect(listBefore.status).toBe(200)
      const beforeBody = (await listBefore.json()) as {
        installed: Array<{ name: string; scope: string; permissionAction: string }>
        library: Array<{ id: string; installed: boolean }>
      }
      expect(beforeBody.library.some((entry) => entry.id === "release-notes" && entry.installed === false)).toBe(true)
      expect(
        beforeBody.installed.some(
          (skill) =>
            skill.name === "local-review" &&
            skill.scope === "workspace" &&
            skill.permissionAction === "ask",
        ),
      ).toBe(true)
      expect(beforeBody.installed.some((skill) => skill.name === "codex-helper")).toBe(true)
      expect(beforeBody.installed.some((skill) => skill.name === "stale-skill")).toBe(true)

      const freshSkillDir = path.join(repo, ".agents", "skills", "fresh-skill")
      fs.renameSync(staleSkillDir, freshSkillDir)
      writeFileSync(
        path.join(freshSkillDir, "SKILL.md"),
        `---
name: fresh-skill
description: Workspace skill after a manual rename.
---

Use the renamed skill after refresh.
`,
      )

      const originalDisposeAll = OpenCodeInstance.disposeAll
      let disposeAllCalls = 0
      OpenCodeInstance.disposeAll = async () => {
        disposeAllCalls += 1
      }

      const listAfterRefresh = await app.request("/api/skills?refresh=1", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      OpenCodeInstance.disposeAll = originalDisposeAll
      expect(listAfterRefresh.status).toBe(200)
      expect(disposeAllCalls).toBe(0)
      const afterRefreshBody = (await listAfterRefresh.json()) as {
        installed: Array<{ name: string }>
      }
      expect(afterRefreshBody.installed.some((skill) => skill.name === "fresh-skill")).toBe(true)
      expect(afterRefreshBody.installed.some((skill) => skill.name === "stale-skill")).toBe(false)

      const installResponse = await app.request("/api/skills/library/release-notes/install", {
        method: "POST",
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(installResponse.status).toBe(200)

      const listAfterInstall = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(listAfterInstall.status).toBe(200)
      const afterInstallBody = (await listAfterInstall.json()) as {
        installed: Array<{ name: string; enabled: boolean }>
        library: Array<{ id: string; installed: boolean }>
      }

      expect(afterInstallBody.installed.some((skill) => skill.name === "release-notes" && skill.enabled)).toBe(true)
      expect(afterInstallBody.library.some((entry) => entry.id === "release-notes" && entry.installed)).toBe(true)

      const disableResponse = await app.request("/api/skills/release-notes", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo,
        },
        body: JSON.stringify({
          enabled: false,
        }),
      })
      expect(disableResponse.status).toBe(200)

      const listAfterDisable = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(listAfterDisable.status).toBe(200)
      const afterDisableBody = (await listAfterDisable.json()) as {
        installed: Array<{ name: string; enabled: boolean }>
      }
      expect(afterDisableBody.installed.some((skill) => skill.name === "release-notes" && skill.enabled === false)).toBe(
        true,
      )

      const localRuleResponse = await app.request("/api/skills/local-review", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo,
        },
        body: JSON.stringify({
          action: "deny",
        }),
      })
      expect(localRuleResponse.status).toBe(200)

      const listAfterLocalRule = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(listAfterLocalRule.status).toBe(200)
      const afterLocalRuleBody = (await listAfterLocalRule.json()) as {
        installed: Array<{ name: string; scope: string; enabled: boolean; permissionAction: string }>
      }
      expect(
        afterLocalRuleBody.installed.some(
          (skill) =>
            skill.name === "local-review" &&
            skill.scope === "workspace" &&
            skill.enabled === false &&
            skill.permissionAction === "deny",
        ),
      ).toBe(true)

      const configAfterLocalRule = await Config.getGlobal()
      const skillRules =
        configAfterLocalRule.permission &&
        typeof configAfterLocalRule.permission !== "string" &&
        typeof configAfterLocalRule.permission.skill !== "string"
          ? configAfterLocalRule.permission.skill
          : undefined
      expect(skillRules?.["local-review"]).toBe("deny")

      const createResponse = await app.request("/api/skills", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo,
        },
        body: JSON.stringify({
          name: "Local Review",
          description: "Should collide with the existing workspace skill.",
          content: "This should be rejected.",
        }),
      })
      expect(createResponse.status).toBe(409)

      const createUniqueResponse = await app.request("/api/skills", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo,
        },
        body: JSON.stringify({
          name: "Plan Helper",
          description: "Builds a focused plan before coding.",
          examplePrompt: "Use the plan-helper skill to organize this task.",
          content: "Plan clearly, then execute in the smallest safe steps.",
        }),
      })
      expect(createUniqueResponse.status).toBe(200)

      const listAfterCreate = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(listAfterCreate.status).toBe(200)
      const afterCreateBody = (await listAfterCreate.json()) as {
        installed: Array<{ name: string; source: string }>
      }
      expect(afterCreateBody.installed.some((skill) => skill.name === "plan-helper" && skill.source === "custom")).toBe(
        true,
      )

      const removeResponse = await app.request("/api/skills/plan-helper", {
        method: "DELETE",
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(removeResponse.status).toBe(200)

      const listAfterRemove = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(listAfterRemove.status).toBe(200)
      const afterRemoveBody = (await listAfterRemove.json()) as {
        installed: Array<{ name: string }>
      }
      expect(afterRemoveBody.installed.some((skill) => skill.name === "plan-helper")).toBe(false)
    } finally {
      process.env.HOME = previousHome
      process.env.BUDDY_TEST_HOME = previousBuddyHome
      process.env.CODEX_HOME = previousCodexHome

      fs.rmSync(path.join(fakeHome, ".codex"), {
        recursive: true,
        force: true,
      })

      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, {
          force: true,
        })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await Config.updateGlobal({})
    }
  })
})
