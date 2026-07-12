import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  clearObsidianVaultIndexCache,
  inspectObsidianVault,
  resolveObsidianVaultLinks,
  updateObsidianVaultIndex,
} from "../src/learning/features/obsidian-vault/service"
import { app } from "../src/index"

const WATCHER_TEST_TIMEOUT_MS = 2_000
const WATCHER_TEST_POLL_INTERVAL_MS = 20

async function waitForWatcherResolution(input: {
  directory: string
  documentPath: string
  target: string
}): Promise<void> {
  const deadline = Date.now() + WATCHER_TEST_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await resolveObsidianVaultLinks({
      directory: input.directory,
      documentPath: input.documentPath,
      targets: [input.target],
    })
    if (result.links[0]?.status === "resolved") return
    await new Promise((resolve) => setTimeout(resolve, WATCHER_TEST_POLL_INTERVAL_MS))
  }
  throw new Error(`Timed out waiting for watcher resolution: ${input.target}`)
}

describe("Obsidian vault compatibility", () => {
  let vaultDirectory = ""

  beforeEach(async () => {
    vaultDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-obsidian-vault-"))
    clearObsidianVaultIndexCache()
  })

  afterEach(async () => {
    clearObsidianVaultIndexCache()
    await fsp.rm(vaultDirectory, { recursive: true, force: true })
  })

  test("detects default, named, and marker-based Obsidian config directories", async () => {
    await Promise.all([
      fsp.mkdir(path.join(vaultDirectory, ".obsidian")),
      fsp.mkdir(path.join(vaultDirectory, ".obsidian-work")),
      fsp.mkdir(path.join(vaultDirectory, ".custom-config")),
    ])
    await Promise.all([
      fsp.writeFile(path.join(vaultDirectory, ".custom-config", "app.json"), "{}"),
      fsp.writeFile(path.join(vaultDirectory, ".custom-config", "core-plugins.json"), "[]"),
    ])

    await expect(inspectObsidianVault(vaultDirectory)).resolves.toEqual({
      compatible: true,
      configDirectories: [".custom-config", ".obsidian", ".obsidian-work"],
    })
  })

  test("detects a symlinked Obsidian config directory", async () => {
    const configDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-obsidian-config-"))
    try {
      await fsp.symlink(
        configDirectory,
        path.join(vaultDirectory, ".obsidian"),
        process.platform === "win32" ? "junction" : "dir",
      )

      await expect(inspectObsidianVault(vaultDirectory)).resolves.toEqual({
        compatible: true,
        configDirectories: [".obsidian"],
      })
    } finally {
      await fsp.rm(configDirectory, { recursive: true, force: true })
    }
  })

  test("resolves paths, shortest duplicate names, aliases, fragments, and embeds", async () => {
    await Promise.all([
      fsp.mkdir(path.join(vaultDirectory, ".obsidian")),
      fsp.mkdir(path.join(vaultDirectory, "Journal"), { recursive: true }),
      fsp.mkdir(path.join(vaultDirectory, "Longer", "Reference"), { recursive: true }),
      fsp.mkdir(path.join(vaultDirectory, "Notes"), { recursive: true }),
      fsp.mkdir(path.join(vaultDirectory, "assets"), { recursive: true }),
    ])
    await Promise.all([
      fsp.writeFile(path.join(vaultDirectory, "Journal", "Today.md"), "# Today\n"),
      fsp.writeFile(
        path.join(vaultDirectory, "Notes", "Alpha.md"),
        ["---", "aliases:", "  - First note", "  - A", "---", "", "# Alpha"].join("\n"),
      ),
      fsp.writeFile(path.join(vaultDirectory, "Longer", "Reference", "Alpha.md"), "# Other"),
      fsp.writeFile(path.join(vaultDirectory, "assets", "diagram.png"), "image"),
      fsp.writeFile(path.join(vaultDirectory, "handout.pdf"), "pdf"),
    ])

    const result = await resolveObsidianVaultLinks({
      directory: vaultDirectory,
      documentPath: "Journal/Today.md",
      targets: [
        "Alpha",
        "First note",
        "../Notes/Alpha#Details",
        "#Local heading",
        "diagram.png",
        "handout.pdf",
        "Missing",
      ],
    })

    expect(result).toEqual({
      partial: false,
      links: [
        { target: "Alpha", status: "resolved", path: "Notes/Alpha.md", kind: "markdown" },
        {
          target: "First note",
          status: "resolved",
          path: "Notes/Alpha.md",
          kind: "markdown",
        },
        {
          target: "../Notes/Alpha#Details",
          status: "resolved",
          path: "Notes/Alpha.md",
          fragment: "Details",
          kind: "markdown",
        },
        {
          target: "#Local heading",
          status: "resolved",
          path: "Journal/Today.md",
          fragment: "Local heading",
          kind: "markdown",
        },
        {
          target: "diagram.png",
          status: "resolved",
          path: "assets/diagram.png",
          kind: "image",
        },
        { target: "handout.pdf", status: "resolved", path: "handout.pdf", kind: "media" },
        { target: "Missing", status: "unresolved" },
      ],
    })
  })

  test("incrementally updates the cached vault index when link targets change", async () => {
    await fsp.writeFile(path.join(vaultDirectory, "Current.md"), "# Current\n")

    await expect(
      resolveObsidianVaultLinks({
        directory: vaultDirectory,
        documentPath: "Current.md",
        targets: ["Later"],
      }),
    ).resolves.toMatchObject({ links: [{ target: "Later", status: "unresolved" }] })

    await fsp.writeFile(path.join(vaultDirectory, "Later.md"), "# Later\n")
    await updateObsidianVaultIndex({
      directory: vaultDirectory,
      path: "Later.md",
      event: "add",
    })

    await expect(
      resolveObsidianVaultLinks({
        directory: vaultDirectory,
        documentPath: "Current.md",
        targets: ["Later"],
      }),
    ).resolves.toMatchObject({
      links: [{ target: "Later", status: "resolved", path: "Later.md", kind: "markdown" }],
    })

    await fsp.rm(path.join(vaultDirectory, "Later.md"))
    await updateObsidianVaultIndex({
      directory: vaultDirectory,
      path: "Later.md",
      event: "unlink",
    })

    await expect(
      resolveObsidianVaultLinks({
        directory: vaultDirectory,
        documentPath: "Current.md",
        targets: ["Later"],
      }),
    ).resolves.toMatchObject({ links: [{ target: "Later", status: "unresolved" }] })
  })

  test("applies external vault changes from the native file watcher", async () => {
    await fsp.writeFile(path.join(vaultDirectory, "Current.md"), "# Current\n")
    await resolveObsidianVaultLinks({
      directory: vaultDirectory,
      documentPath: "Current.md",
      targets: ["External"],
    })

    await fsp.writeFile(path.join(vaultDirectory, "External.md"), "# External\n")
    await waitForWatcherResolution({
      directory: vaultDirectory,
      documentPath: "Current.md",
      target: "External",
    })
  })

  test("invalidates stale alias resolutions after vault content changes", async () => {
    const resolvedVaultDirectory = await fsp.realpath(vaultDirectory)
    await fsp.writeFile(
      path.join(vaultDirectory, "Alpha.md"),
      "---\naliases: [Shared]\n---\n# Alpha\n",
    )
    await expect(
      resolveObsidianVaultLinks({
        directory: resolvedVaultDirectory,
        documentPath: "Current.md",
        targets: ["Shared"],
      }),
    ).resolves.toMatchObject({
      links: [{ target: "Shared", status: "resolved", path: "Alpha.md" }],
    })

    const headers = {
      "content-type": "application/json",
      "x-buddy-directory": vaultDirectory,
    }
    const alphaSaveResponse = await app.request("/api/file/edit?path=Alpha.md", {
      method: "PUT",
      headers,
      body: JSON.stringify({ content: "# Alpha\n" }),
    })
    const betaSaveResponse = await app.request("/api/file/edit?path=Beta.md", {
      method: "PUT",
      headers,
      body: JSON.stringify({ content: "---\naliases: [Shared]\n---\n# Beta\n" }),
    })
    expect(alphaSaveResponse.status).toBe(200)
    expect(betaSaveResponse.status).toBe(200)

    await expect(
      resolveObsidianVaultLinks({
        directory: resolvedVaultDirectory,
        documentPath: "Current.md",
        targets: ["Shared"],
      }),
    ).resolves.toMatchObject({
      links: [{ target: "Shared", status: "resolved", path: "Beta.md" }],
    })
  })

  test("exposes vault detection and batch resolution through the mounted API", async () => {
    await fsp.mkdir(path.join(vaultDirectory, ".obsidian"))
    await fsp.writeFile(path.join(vaultDirectory, "Current.md"), "# Current\n")
    await fsp.writeFile(path.join(vaultDirectory, "Linked.md"), "# Linked\n")
    const headers = { "x-buddy-directory": vaultDirectory }

    const profileResponse = await app.request("/api/obsidian/profile", { headers })
    expect(profileResponse.status).toBe(200)
    await expect(profileResponse.json()).resolves.toEqual({
      compatible: true,
      configDirectories: [".obsidian"],
    })

    const linksResponse = await app.request("/api/obsidian/resolve-links", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        documentPath: "Current.md",
        targets: ["Linked", "Missing"],
      }),
    })
    expect(linksResponse.status).toBe(200)
    await expect(linksResponse.json()).resolves.toEqual({
      partial: false,
      links: [
        { target: "Linked", status: "resolved", path: "Linked.md", kind: "markdown" },
        { target: "Missing", status: "unresolved" },
      ],
    })
  })
})
