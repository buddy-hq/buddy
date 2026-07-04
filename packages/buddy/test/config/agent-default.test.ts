import { describe, expect, test } from "bun:test"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Config, InvalidError } from "@buddy/backend/config"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"

describe("config default_persona", () => {
  test("defaults to buddy when no default_persona is configured", async () => {
    const repo = createGitRepo("buddy-config-default-persona-default")

    const selected = await withSyncedOpenCodeConfig(repo, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("buddy")
  })

  test("uses configured code-buddy as default_persona", async () => {
    const repo = createGitRepo("buddy-config-default-persona-code")

    writeProjectConfig(
      repo,
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

  test("propagates hidden personas into the runtime agent catalog", async () => {
    const repo = createGitRepo("buddy-config-hidden-persona")

    writeProjectConfig(
      repo,
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

    writeProjectConfig(
      repo,
      JSON.stringify(
        {
          personas: {
            buddy: {
              hidden: true,
            },
            "code-buddy": {
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

    writeProjectConfig(
      repo,
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

  test("rejects defaultSurface overrides that are not present in inherited surfaces", async () => {
    const repo = createGitRepo("buddy-config-invalid-default-surface-only")

    writeProjectConfig(
      repo,
      JSON.stringify(
        {
          personas: {
            "code-buddy": {
              defaultSurface: "flashcard",
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
            message: 'defaultSurface "flashcard" must remain available for code-buddy',
          }),
        ]),
      },
    })
  })
})
