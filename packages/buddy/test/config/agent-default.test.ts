import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Config, InvalidError } from "@buddy/backend/config"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { createGitRepo } from "../helpers/repo"

describe("config default_persona", () => {
  test("defaults to buddy when no default_persona is configured", async () => {
    const repo = createGitRepo("buddy-config-default-persona-default")

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("buddy")
  })

  test("uses configured code-buddy as default_persona", async () => {
    const repo = createGitRepo("buddy-config-default-persona-code")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_persona: "code-buddy",
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("code-buddy")
  })

  test("uses configured math-buddy as default_persona", async () => {
    const repo = createGitRepo("buddy-config-default-persona-math")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_persona: "math-buddy",
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("math-buddy")
  })

  test("propagates hidden personas into the runtime agent catalog", async () => {
    const repo = createGitRepo("buddy-config-hidden-persona")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          personas: {
            "code-buddy": {
              hidden: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const codeBuddy = await withSyncedOpenCodeConfig(repo, async () =>
      OpenCodeAgent.get("code-buddy"),
    )

    expect(codeBuddy?.hidden).toBe(true)
  })

  test("rejects configs that hide every Buddy persona", async () => {
    const repo = createGitRepo("buddy-config-hidden-all-personas")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          personas: {
            buddy: {
              hidden: true,
            },
            "code-buddy": {
              hidden: true,
            },
            "math-buddy": {
              hidden: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await expect(Config.getProject(repo)).rejects.toBeInstanceOf(InvalidError)
    await expect(Config.getProject(repo)).rejects.toMatchObject({
      data: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "At least one Buddy persona must remain visible",
          }),
        ]),
      },
    })
  })

  test("rejects surfaces overrides that remove the inherited default surface", async () => {
    const repo = createGitRepo("buddy-config-invalid-default-surface")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          personas: {
            "code-buddy": {
              surfaces: ["curriculum"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await expect(Config.getProject(repo)).rejects.toBeInstanceOf(InvalidError)
    await expect(Config.getProject(repo)).rejects.toMatchObject({
      data: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: 'defaultSurface "editor" must remain available for code-buddy',
          }),
        ]),
      },
    })
  })
})
