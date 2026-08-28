import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { writeFileSync } from "node:fs"
import { app } from "../../src/index.ts"
import { Config } from "@buddy/backend/config"
import { Global } from "../../src/storage"
import { BUDDY_ENV } from "../../src/storage/constants"
import { createGitRepo } from "../helpers/repo"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { temporaryEnvironment } from "../helpers/temporary-environment"
import {
  requireJsonObject,
  requireJsonArray,
  parseJsonObject,
  parseJsonObjectText,
  type TJsonValue,
  type TJsonObject,
} from "../helpers/parse"

const HOME_ENVIRONMENT_KEY = "HOME"
const CODEX_HOME_ENVIRONMENT_KEY = "CODEX_HOME"

function skillRecords(value: TJsonValue | undefined, label: string): TJsonObject[] {
  return requireJsonArray(value, label).map((entry) => requireJsonObject(entry, label))
}

describe("skills routes", () => {
  test("applies skills v2 roots, external toggle, and curated install flow", async () => {
    await using repo = await createGitRepo("buddy-route-skills")
    const workspaceAgentSkillDir = path.join(repo.path, ".agents", "skills", "local-review")
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

    await using fakeHome = await temporaryDirectory({ prefix: "buddy-skills-home-" })
    using environment = temporaryEnvironment({
      [HOME_ENVIRONMENT_KEY]: fakeHome.path,
      [BUDDY_ENV.TEST_HOME]: fakeHome.path,
      [CODEX_HOME_ENVIRONMENT_KEY]: path.join(fakeHome.path, ".codex"),
    })
    void environment
    const globalFile = path.join(Global.Path.config, "buddy.jsonc")
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, "utf8")
      : undefined

    try {
      fs.rmSync(path.join(fakeHome.path, ".buddy"), {
        recursive: true,
        force: true,
      })
      fs.rmSync(globalFile, {
        force: true,
      })

      const installedLockPath = path.join(fakeHome.path, ".buddy", "skills.lock.json")
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
                installedPath: path.join(
                  fakeHome.path,
                  ".buddy",
                  "skills",
                  "library",
                  "anthropic-pptx",
                ),
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      )

      const listBefore = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo.path,
        },
      })

      expect(listBefore.status).toBe(200)
      const beforeBody = requireJsonObject(await listBefore.json())
      const beforeInstalled = skillRecords(beforeBody.installed, "installed skills")
      const beforeLibrary = skillRecords(beforeBody.library, "skill library")

      expect(beforeBody.managedRoot).toBe(path.join(fakeHome.path, ".buddy", "skills"))
      expect(beforeBody.externalVendorRootsEnabled).toBe(false)
      expect(beforeInstalled.some((skill) => skill.name === "local-review")).toBe(false)
      expect(
        beforeInstalled.some((skill) => skill.name === "reading" && skill.source === "system"),
      ).toBe(true)
      expect(beforeInstalled.find((skill) => skill.name === "reading")).toMatchObject({
        displayName: "Reading",
        shortDescription: "Read and analyze books, papers, articles, and resources",
      })
      expect(
        beforeLibrary.some((entry) => entry.id === "anthropic-pptx" && entry.state === "available"),
      ).toBe(true)
      const installedSystemManifestPath = path.join(
        fakeHome.path,
        ".buddy",
        "skills",
        ".system",
        "reading",
        "agents",
        "buddy.yaml",
      )
      expect(fs.existsSync(installedSystemManifestPath)).toBe(true)
      fs.rmSync(installedSystemManifestPath)

      const removeSystemSkillResponse = await app.request("/api/skills/reading", {
        method: "DELETE",
        headers: {
          "x-buddy-directory": repo.path,
        },
      })
      expect(removeSystemSkillResponse.status).toBe(403)
      expect(
        fs.existsSync(
          path.join(fakeHome.path, ".buddy", "skills", ".system", "reading", "SKILL.md"),
        ),
      ).toBe(true)
      expect(fs.existsSync(installedSystemManifestPath)).toBe(true)
      const reconciledLock = parseJsonObjectText(fs.readFileSync(installedLockPath, "utf8"))
      expect(
        Object.keys(requireJsonObject(reconciledLock.installed, "installed skills")),
      ).toHaveLength(0)

      const toggleOnResponse = await app.request("/api/skills/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo.path,
        },
        body: JSON.stringify({
          externalVendorRootsEnabled: true,
        }),
      })
      expect(toggleOnResponse.status).toBe(200)

      const listAfterToggle = await app.request("/api/skills?refresh=1", {
        headers: {
          "x-buddy-directory": repo.path,
        },
      })
      expect(listAfterToggle.status).toBe(200)
      const afterToggleBody = requireJsonObject(await listAfterToggle.json())
      const afterToggleInstalled = skillRecords(afterToggleBody.installed, "installed skills")
      expect(afterToggleBody.externalVendorRootsEnabled).toBe(true)
      expect(
        afterToggleInstalled.some(
          (skill) =>
            skill.name === "local-review" &&
            skill.scope === "workspace" &&
            skill.permissionAction === "allow",
        ),
      ).toBe(true)
      expect(afterToggleInstalled.find((skill) => skill.name === "local-review")).toMatchObject({
        displayName: "local-review",
        shortDescription: "Workspace-local review workflow.",
      })
      const localRuleResponse = await app.request("/api/skills/local-review", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo.path,
        },
        body: JSON.stringify({
          action: "deny",
        }),
      })
      expect(localRuleResponse.status).toBe(200)

      const listAfterLocalRule = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo.path,
        },
      })
      expect(listAfterLocalRule.status).toBe(200)
      const afterLocalRuleBody = requireJsonObject(await listAfterLocalRule.json())
      const afterLocalRuleInstalled = skillRecords(afterLocalRuleBody.installed, "installed skills")
      expect(
        afterLocalRuleInstalled.some(
          (skill) =>
            skill.name === "local-review" &&
            skill.scope === "workspace" &&
            skill.enabled === false &&
            skill.permissionAction === "deny",
        ),
      ).toBe(true)

      const configAfterLocalRule = await Config.getGlobal()
      const skillRules = parseJsonObject(parseJsonObject(configAfterLocalRule.permission)?.skill)
      expect(skillRules?.["local-review"]).toBe("deny")

      const createResponse = await app.request("/api/skills", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": repo.path,
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
          "x-buddy-directory": repo.path,
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
          "x-buddy-directory": repo.path,
        },
      })
      expect(listAfterCreate.status).toBe(200)
      const afterCreateBody = requireJsonObject(await listAfterCreate.json())
      expect(
        skillRecords(afterCreateBody.installed, "installed skills").some(
          (skill) => skill.name === "plan-helper" && skill.source === "custom",
        ),
      ).toBe(true)

      const removeCustomResponse = await app.request("/api/skills/plan-helper", {
        method: "DELETE",
        headers: {
          "x-buddy-directory": repo.path,
        },
      })
      expect(removeCustomResponse.status).toBe(200)

      const listAfterRemove = await app.request("/api/skills", {
        headers: {
          "x-buddy-directory": repo.path,
        },
      })
      expect(listAfterRemove.status).toBe(200)
      const afterRemoveBody = requireJsonObject(await listAfterRemove.json())
      expect(
        skillRecords(afterRemoveBody.installed, "installed skills").some(
          (skill) => skill.name === "plan-helper",
        ),
      ).toBe(false)
    } finally {
      fs.rmSync(path.join(fakeHome.path, ".buddy"), {
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
  }, 15_000)
})
