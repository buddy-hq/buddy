import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { mkdtempSync, writeFileSync } from "node:fs"
import { app } from "../../src/index.ts"
import { Config } from "@buddy/backend/config"
import { Global } from "../../src/storage"
import { createGitRepo } from "../helpers/repo"

describe("skills routes", () => {
  test("applies skills v2 roots, external toggle, and curated install flow", async () => {
    const repo = createGitRepo("buddy-route-skills")
    const workspaceAgentSkillDir = path.join(repo, ".agents", "skills", "local-review")
    fs.mkdirSync(workspaceAgentSkillDir, {
      recursive: true,
    })
    writeFileSync(
      path.join(workspaceAgentSkillDir, "SKILL.md"),
      `---
name: local-review
description: Workspace-local review workflow.
---

Use the local review workflow for this repository.
`,
    )

    const fakeHome = mkdtempSync(path.join(os.tmpdir(), "buddy-skills-home-"))
    const previousHome = process.env.HOME
    const previousBuddyHome = process.env.BUDDY_TEST_HOME
    const previousCodexHome = process.env.CODEX_HOME
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    process.env.HOME = fakeHome
    process.env.BUDDY_TEST_HOME = fakeHome
    process.env.CODEX_HOME = path.join(fakeHome, ".codex")

    fs.rmSync(path.join(fakeHome, ".buddy"), {
      recursive: true,
      force: true,
    })
    fs.rmSync(globalFile, {
      force: true,
    })

    const installedLockPath = path.join(fakeHome, ".buddy", "skills.lock.json")
    fs.mkdirSync(path.dirname(installedLockPath), { recursive: true })
    writeFileSync(
      installedLockPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          installed: {
            "anthropic-pptx": {
              catalogId: "anthropic-pptx",
              displayName: "PowerPoint Presentation",
              skillName: "pptx",
              source: {
                type: "github",
                repo: "anthropics/skills",
                path: "skills/pptx",
                ref: "f458cee31a7577a47ba0c9a101976fa599385174",
              },
              integrity: {
                algorithm: "tree-sha256-v1",
                sha256: "282238363dfc8f6d3bf72326976397182e87e93d10ade6e2f05bfbf931a5dc37",
                sizeBytes: 1129944,
                fileCount: 59,
              },
              installedAt: "2026-05-10T00:00:00.000Z",
              scannerPolicyVersion: 1,
              state: "active",
              installedPath: path.join(fakeHome, ".buddy", "skills", "library", "anthropic-pptx"),
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    try {
      const listBefore = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo,
        },
      })

      expect(listBefore.status).toBe(200)
      const beforeBody = (await listBefore.json()) as {
        managedRoot: string
        externalVendorRootsEnabled: boolean
        installed: Array<{ name: string }>
        library: Array<{ id: string; state: string }>
      }

      expect(beforeBody.managedRoot).toBe(path.join(fakeHome, ".buddy", "skills"))
      expect(beforeBody.externalVendorRootsEnabled).toBe(false)
      expect(beforeBody.installed.some((skill) => skill.name === "local-review")).toBe(false)
      expect(
        beforeBody.library.some(
          (entry) => entry.id === "anthropic-pptx" && entry.state === "available",
        ),
      ).toBe(true)
      const removeSystemSkillResponse = await app.request("/api/skills/reading", {
        method: "DELETE",
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(removeSystemSkillResponse.status).toBe(403)
      expect(
        fs.existsSync(path.join(fakeHome, ".buddy", "skills", ".system", "reading", "SKILL.md")),
      ).toBe(true)
      const reconciledLock = JSON.parse(fs.readFileSync(installedLockPath, "utf8")) as {
        installed: Record<string, unknown>
      }
      expect(Object.keys(reconciledLock.installed)).toHaveLength(0)

      const toggleOnResponse = await app.request("/api/skills/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo,
        },
        body: JSON.stringify({
          externalVendorRootsEnabled: true,
        }),
      })
      expect(toggleOnResponse.status).toBe(200)

      const listAfterToggle = await app.request("/api/skills?refresh=1", {
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(listAfterToggle.status).toBe(200)
      const afterToggleBody = (await listAfterToggle.json()) as {
        externalVendorRootsEnabled: boolean
        installed: Array<{ name: string; scope: string; permissionAction: string }>
      }
      expect(afterToggleBody.externalVendorRootsEnabled).toBe(true)
      expect(
        afterToggleBody.installed.some(
          (skill) =>
            skill.name === "local-review" &&
            skill.scope === "workspace" &&
            skill.permissionAction === "allow",
        ),
      ).toBe(true)
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
        installed: Array<{
          name: string
          scope: string
          enabled: boolean
          permissionAction: string
        }>
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
      expect(
        afterCreateBody.installed.some(
          (skill) => skill.name === "plan-helper" && skill.source === "custom",
        ),
      ).toBe(true)

      const removeCustomResponse = await app.request("/api/skills/plan-helper", {
        method: "DELETE",
        headers: {
          "x-buddy-directory": repo,
        },
      })
      expect(removeCustomResponse.status).toBe(200)

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

      fs.rmSync(path.join(fakeHome, ".buddy"), {
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
