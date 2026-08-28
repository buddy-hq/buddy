import { describe, expect, test } from "bun:test"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Config, InvalidError } from "@buddy/backend/config"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"
import { writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"

describe("config default_persona", () => {
  test("defaults to buddy when no default_persona is configured", async () => {
    await using repo = await createGitRepo("buddy-config-default-persona-default")

    const selected = await withSyncedOpenCodeConfig(repo.path, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("buddy")
  })

  test("uses configured teaching-buddy as default_persona", async () => {
    await using repo = await createGitRepo("buddy-config-default-persona-teaching")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          default_persona: "teaching-buddy",
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo.path, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("teaching-buddy")
  })

  test("uses teaching-buddy when teaching is the primary use", async () => {
    await using repo = await createGitRepo("buddy-config-primary-use-teach")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          personalization: {
            primary_use: "teach",
          },
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo.path, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("teaching-buddy")
  })

  test("keeps an explicit default_persona ahead of the primary-use default", async () => {
    await using repo = await createGitRepo("buddy-config-explicit-default-over-primary-use")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          default_persona: "buddy",
          personalization: {
            primary_use: "teach",
          },
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await withSyncedOpenCodeConfig(repo.path, () => OpenCodeAgent.defaultAgent())

    expect(selected).toBe("buddy")
  })

  test("propagates hidden personas into the runtime agent catalog", async () => {
    await using repo = await createGitRepo("buddy-config-hidden-persona")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          personas: {
            "teaching-buddy": {
              hidden: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const teachingBuddy = await withSyncedOpenCodeConfig(repo.path, async () =>
      OpenCodeAgent.get("teaching-buddy"),
    )

    expect(teachingBuddy?.hidden).toBe(true)
  })

  test("rejects configs that hide every Buddy persona", async () => {
    await using repo = await createGitRepo("buddy-config-hidden-all-personas")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          personas: {
            buddy: {
              hidden: true,
            },
            "teaching-buddy": {
              hidden: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await expect(Config.getProject(repo.path)).rejects.toBeInstanceOf(InvalidError)
    await expect(Config.getProject(repo.path)).rejects.toMatchObject({
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
    await using repo = await createGitRepo("buddy-config-invalid-default-surface")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          personas: {
            "teaching-buddy": {
              surfaces: ["flashcard"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await expect(Config.getProject(repo.path)).rejects.toBeInstanceOf(InvalidError)
    await expect(Config.getProject(repo.path)).rejects.toMatchObject({
      data: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: 'defaultSurface "curriculum" must remain available for teaching-buddy',
          }),
        ]),
      },
    })
  })

  test("rejects defaultSurface overrides that are not present in inherited surfaces", async () => {
    await using repo = await createGitRepo("buddy-config-invalid-default-surface-only")

    writeProjectConfig(
      repo.path,
      JSON.stringify(
        {
          personas: {
            "teaching-buddy": {
              defaultSurface: "editor",
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await expect(Config.getProject(repo.path)).rejects.toBeInstanceOf(InvalidError)
    await expect(Config.getProject(repo.path)).rejects.toMatchObject({
      data: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: 'defaultSurface "editor" must remain available for teaching-buddy',
          }),
        ]),
      },
    })
  })
})
