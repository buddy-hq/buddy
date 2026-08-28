import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import {
  prepareObsidianCalloutsForMdxEditor,
  restoreObsidianCalloutsFromMdxEditor,
} from "../src/components/bench/markdown-bench-obsidian-callouts"
import { collectObsidianWikiLinkTargets } from "../src/components/bench/markdown-bench-obsidian-plugin"
import {
  batchObsidianLinkTargets,
  invalidateObsidianFileCaches,
  invalidateObsidianWatcherCaches,
  obsidianVaultQueryKeys,
} from "../src/state/obsidian-vault-query"

describe("Obsidian Markdown compatibility", () => {
  test("round-trips titled and foldable callouts without changing final newlines", () => {
    const markdown = [
      "> [!tip]+ Evidence",
      "> Connect the observation.",
      ">",
      "> Then explain it.",
      "",
    ].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toContain(':::obsidian-callout{kind="tip" fold="+" title="Evidence"}')
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("leaves ordinary blockquotes and container directives unchanged", () => {
    const markdown = ["> Ordinary quote", "", ":::tip", "Keep this directive.", ":::"].join("\n")

    expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(markdown)
    expect(restoreObsidianCalloutsFromMdxEditor(markdown)).toBe(markdown)
  })

  test("preserves callout-like syntax inside frontmatter and fenced code", () => {
    const markdown = [
      "---",
      "example: |",
      "  > [!tip] Frontmatter example",
      "---",
      "",
      "```md",
      "> [!tip] Fenced example",
      "> Keep this literal.",
      "```",
      "",
      "```md",
      ':::obsidian-callout{kind="tip"}',
      "Keep this directive literal.",
      ":::",
      "```",
    ].join("\r\n")

    expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(markdown)
    expect(restoreObsidianCalloutsFromMdxEditor(markdown)).toBe(markdown)
  })

  test("collects unique resolver targets without aliases", () => {
    expect(
      collectObsidianWikiLinkTargets(
        "[[Beta]] [[Alpha|A]] ![[image.png]] [[Beta]] [[Alpha#Heading]]",
      ),
    ).toEqual(["Alpha", "Alpha#Heading", "Beta", "image.png"])
  })

  test("batches large resolver requests within the API target limit", () => {
    const targets = Array.from({ length: 501 }, (_, index) => `Note ${index}`)

    const batches = batchObsidianLinkTargets(targets)

    expect(batches.map((batch) => batch.length)).toEqual([500, 1])
    expect(batches.flat()).toEqual(targets)
  })

  test("invalidates link resolutions and the edited embedded note together", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const path = "Notes/Alpha.md"
    const linkKey = obsidianVaultQueryKeys.links(directory, "Index.md", ["Shared"])
    const otherDirectoryLinkKey = obsidianVaultQueryKeys.links("/tmp/other-vault", "Index.md", [
      "Shared",
    ])
    const embeddedNoteKey = obsidianVaultQueryKeys.embeddedNote(directory, path)
    queryClient.setQueryData(linkKey, { links: [], partial: false })
    queryClient.setQueryData(otherDirectoryLinkKey, { links: [], partial: false })
    queryClient.setQueryData(embeddedNoteKey, { content: "# Alpha" })

    await invalidateObsidianFileCaches(queryClient, {
      directory,
      path,
      previousContent: "---\naliases: [Old]\n---\n# Alpha",
      content: "---\naliases: [Shared]\n---\n# Alpha",
    })

    expect(queryClient.getQueryState(linkKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(embeddedNoteKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(otherDirectoryLinkKey)?.isInvalidated).toBe(false)
  })

  test("keeps link resolutions cached for body-only note edits", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const path = "Notes/Alpha.md"
    const linkKey = obsidianVaultQueryKeys.links(directory, "Index.md", ["Shared"])
    const embeddedNoteKey = obsidianVaultQueryKeys.embeddedNote(directory, path)
    queryClient.setQueryData(linkKey, { links: [], partial: false })
    queryClient.setQueryData(embeddedNoteKey, { content: "# Alpha" })

    await invalidateObsidianFileCaches(queryClient, {
      directory,
      path,
      previousContent: "---\naliases: [Shared]\n---\n# Old body",
      content: "---\naliases: [Shared]\n---\n# New body",
    })

    expect(queryClient.getQueryState(linkKey)?.isInvalidated).toBe(false)
    expect(queryClient.getQueryState(embeddedNoteKey)?.isInvalidated).toBe(true)
  })

  test("invalidates link resolutions for watcher-driven Markdown changes", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const linkKey = obsidianVaultQueryKeys.links(directory, "Index.md", ["Shared"])
    const profileKey = obsidianVaultQueryKeys.profile(directory)
    queryClient.setQueryData(linkKey, { links: [], partial: false })
    queryClient.setQueryData(profileKey, {
      detected: true,
      connected: true,
      configDirectories: [".obsidian"],
    })

    await invalidateObsidianWatcherCaches(queryClient, {
      directory,
      path: "Notes/Alpha.md",
      event: "change",
    })

    expect(queryClient.getQueryState(linkKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(false)
  })

  test("invalidates vault detection when root config directories change", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const profileKey = obsidianVaultQueryKeys.profile(directory)
    queryClient.setQueryData(profileKey, {
      detected: false,
      connected: false,
      configDirectories: [],
    })

    await invalidateObsidianWatcherCaches(queryClient, {
      directory,
      path: ".obsidian",
      event: "add",
    })

    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true)
  })

  test("invalidates vault detection when custom config markers change", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const profileKey = obsidianVaultQueryKeys.profile(directory)
    queryClient.setQueryData(profileKey, {
      detected: false,
      connected: false,
      configDirectories: [],
    })

    await invalidateObsidianWatcherCaches(queryClient, {
      directory,
      path: ".custom-config/core-plugins.json",
      event: "change",
    })

    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true)
  })
})
