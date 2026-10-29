import { describe, expect, test } from "bun:test"
import { formatBetaReleaseBody, readBetaReleaseBody } from "@buddy/script/release-stream"
import {
  resolveReleaseExecution,
  selectWorkflowRunUrls,
  parseReleaseWizardArgs,
  editReleaseDraft,
  type WorkflowRun,
} from "./cut-release"
import { parseReleasePlan } from "./release/plan"
import { resolveBetaDraftReleaseBody } from "./release/beta-publication"
import { assertReleaseBranch, releaseDistribution } from "./release/distribution-guard"
import { createInterface } from "node:readline/promises"
import { PassThrough } from "node:stream"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { z } from "zod"

const CURRENT_SOURCE_SHA = "1".repeat(40)
const PLANNED_SOURCE_SHA = "2".repeat(40)

async function authoredDraftFixture(channel: "prod" | "beta", existing: boolean, notes: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-notes-draft-"))
  try {
    const notesPath = path.join(directory, "authored.md")
    const captured = path.join(directory, "captured.json")
    const gh = path.join(directory, "gh")
    await Bun.write(notesPath, notes)
    await Bun.write(gh, `#!${process.execPath}
import { readFileSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2)
if (args[0] !== "release") throw new Error("Unexpected command")
if (args[1] === "create" || args[1] === "edit") {
  const body = readFileSync(args[args.indexOf("--notes-file") + 1], "utf8")
  writeFileSync(process.env.FIXTURE_CAPTURE, JSON.stringify({ body, title: args[args.indexOf("--title") + 1], args }))
} else if (args[1] === "view") {
  const state = JSON.parse(readFileSync(process.env.FIXTURE_CAPTURE, "utf8"))
  console.log(JSON.stringify({ assets: [], body: state.body, isDraft: true, isPrerelease: process.env.BUDDY_CHANNEL === "beta", name: state.title, tagName: args[2], url: "https://example.test/release" }))
} else throw new Error("Unexpected release command")
`)
    await chmod(gh, 0o755)
    const result = spawnSync(process.execPath, ["--eval", `
import { createInterface } from "node:readline/promises";
import { PassThrough } from "node:stream";
import { editReleaseDraft, parseReleaseWizardArgs, upsertDraftRelease } from ${JSON.stringify(path.join(import.meta.dir, "cut-release.ts"))};
const flags = parseReleaseWizardArgs(["--channel", ${JSON.stringify(channel)}, "--fs", "--notes", ${JSON.stringify(notesPath)}, "--title", "Buddy: useful changes"]);
const existing = ${existing ? JSON.stringify({ assets: [], body: "- Previous notes", isDraft: true, isPrerelease: channel === "beta", name: "Previous title", tagName: channel === "beta" ? "beta-v0.1.0" : "v0.1.0", url: "https://example.test/release" }) : "undefined"};
const rl = createInterface({ input: new PassThrough(), output: new PassThrough() });
try {
  const edited = await editReleaseDraft(rl, "0.1.0", existing, ${JSON.stringify(CURRENT_SOURCE_SHA)}, flags);
  await upsertDraftRelease("0.1.0", edited.title, edited.body, ${JSON.stringify(CURRENT_SOURCE_SHA)}, existing);
} finally { rl.close(); }
`], {
      encoding: "utf8",
      env: { ...process.env, BUDDY_CHANNEL: channel, BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases", GH_REPO: "", PATH: `${directory}${path.delimiter}${process.env.PATH}`, FIXTURE_CAPTURE: captured },
    })
    return {
      result,
      captured: await Bun.file(captured).exists()
        ? z.object({ body: z.string(), title: z.string(), args: z.array(z.string()) }).parse(await Bun.file(captured).json())
        : undefined,
      source: await Bun.file(notesPath).text(),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function plannedRelease() {
  return parseReleasePlan({
    advancedMathInputSha256: "3".repeat(64),
    advancedMathVersion: "runtime-42",
    createdBy: {
      repository: "buddy-hq/buddy",
      runAttempt: "1",
      runId: "123",
      workflow: "publish",
    },
    releaseDate: "2026-08-29T10:00:00+00:00",
    schemaVersion: 1,
    sourceRepository: "buddy-hq/buddy",
    sourceSha: PLANNED_SOURCE_SHA,
    tag: "v1.2.3",
    targets: { macosArm64: true, macosX64: false, windowsX64: true },
    toolchain: {
      bun: "1.3.13",
      python: "3.12",
      runners: {
        macosArm64: "macos-26",
        macosX64: "macos-26-intel",
        windowsX64: "windows-2025-vs2026",
      },
    },
    version: "1.2.3",
  })
}

describe("cut release", () => {
  test.each([
    ["prod", "main", "beta", "Preview release candidates"],
    ["beta", "beta", "main", "Beta releases"],
  ] as const)("requires the %s source branch", (channel, branch, otherBranch, label) => {
    const flags = parseReleaseWizardArgs(channel === "prod" ? [] : ["--channel", channel])
    const distribution = releaseDistribution({ BUDDY_CHANNEL: flags.channel })
    expect(distribution.releaseBranch).toBe(branch)
    expect(() => assertReleaseBranch(branch, distribution)).not.toThrow()
    expect(() => assertReleaseBranch(otherBranch, distribution)).toThrow(
      `${label} must be cut from ${branch}, received '${otherBranch}'`,
    )
    expect(() => assertReleaseBranch("", distribution)).toThrow(
      `${label} must be cut from ${branch}, received ''`,
    )
  })

  test("prefers the exact dispatched release run over an older fallback", () => {
    const run = (displayTitle: string, url: string): WorkflowRun => ({
      createdAt: "2026-08-29T10:00:00Z",
      displayTitle,
      event: "workflow_dispatch",
      headBranch: "main",
      headSha: CURRENT_SOURCE_SHA,
      url,
    })
    expect(
      selectWorkflowRunUrls([run("preview candidate v1.2.2", "https://example.test/old")], "1.2.3"),
    ).toEqual({ exact: undefined, fallback: "https://example.test/old" })
    expect(
      selectWorkflowRunUrls(
        [
          run("preview candidate v1.2.3", "https://example.test/exact"),
          run("preview candidate v1.2.2", "https://example.test/old"),
        ],
        "1.2.3",
      ),
    ).toEqual({
      exact: "https://example.test/exact",
      fallback: "https://example.test/exact",
    })
  })

  test("resumes a planned draft from its pinned source and targets", () => {
    expect(
      resolveReleaseExecution({
        currentSourceSha: CURRENT_SOURCE_SHA,
        plan: plannedRelease(),
        repository: "buddy-hq/buddy",
        requestedTargets: { macosArm64: false, macosX64: true, windowsX64: false },
        tag: "v1.2.3",
        version: "1.2.3",
      }),
    ).toEqual({
      sourceSha: PLANNED_SOURCE_SHA,
      targets: { macosArm64: true, macosX64: false, windowsX64: true },
    })
  })

  test("rejects a plan from another release identity", () => {
    expect(() =>
      resolveReleaseExecution({
        currentSourceSha: CURRENT_SOURCE_SHA,
        plan: plannedRelease(),
        repository: "buddy-hq/buddy",
        requestedTargets: { macosArm64: true, macosX64: true, windowsX64: true },
        tag: "v1.2.4",
        version: "1.2.4",
      }),
    ).toThrow("identity does not match")
  })
})

describe("Beta release wizard", () => {
  test.each([
    ["prod", false], ["prod", true], ["beta", false], ["beta", true],
  ] as const)("%s uses the notes file and title when existing draft is %s", async (channel, existing) => {
    const notes = "- Your chat opens faster.  \n- Sources keep <details> & links.\n"
    const fixture = await authoredDraftFixture(channel, existing, notes)
    expect(fixture.result.status).toBe(0)
    expect(fixture.captured?.body).toBe(channel === "beta" ? formatBetaReleaseBody(notes) : notes)
    expect(fixture.captured?.title).toBe("Buddy: useful changes")
    expect(fixture.captured?.args[1]).toBe(existing ? "edit" : "create")
    expect(fixture.source).toBe(notes)
  })

  test.each([
    ["prod", false, ""],
    ["beta", true, "# Raw release notes input — replace with user-facing notes\n- raw"],
    ["beta", false, "&".repeat(25_000)],
  ] as const)("rejects invalid %s notes before existing=%s GitHub writes", async (channel, existing, notes) => {
    const fixture = await authoredDraftFixture(channel, existing, notes)
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toMatch(/must not be empty|Replace the raw input|120,000/u)
    expect(fixture.captured).toBeUndefined()
    expect(fixture.source).toBe(notes)
  })
  test("frozen draft retries keep the body byte-identical and Beta decodes the original notes", () => {
    const notes = "- Original <Beta> & notes\n- Preserve trailing whitespace  \n"
    const body = formatBetaReleaseBody(notes).replaceAll("\n", "\r\n") + "\r\n"
    const draft = { body, assets: [{ name: "buddy-release-freeze.json" }] }
    for (let retry = 0; retry < 2; retry += 1) {
      draft.body = resolveBetaDraftReleaseBody({ notes: draft.body, existingRelease: draft })
      expect(draft.body).toBe(body)
      expect(readBetaReleaseBody(draft.body)).toBe(notes)
    }
  })

  test("editable Beta draft notes are wrapped once before publication", () => {
    const notes = "- Editable <Beta> & notes"
    const body = resolveBetaDraftReleaseBody({ notes, existingRelease: undefined })
    expect(readBetaReleaseBody(body)).toBe(notes)
    expect(
      resolveBetaDraftReleaseBody({
        notes: "- Revised notes",
        existingRelease: { body, assets: [] },
      }),
    ).toBe(formatBetaReleaseBody("- Revised notes"))
  })

  test("defaults to prod and accepts explicit Beta targets", () => {
    expect(parseReleaseWizardArgs([]).channel).toBe("prod")
    expect(parseReleaseWizardArgs(["--channel", "beta", "--targets", "all", "--fs", "--notes", "notes.md"])).toEqual({
      channel: "beta",
      fast: true,
      help: false,
      notes: "notes.md",
      title: undefined,
      skipLocalReleaseGates: true,
      targets: { macosArm64: true, macosX64: true, windowsX64: true },
    })
    expect(parseReleaseWizardArgs(["--channel=beta"]).channel).toBe("beta")
    expect(() => parseReleaseWizardArgs(["--channel", "dev"])).toThrow("must be prod or beta")
    expect(() => parseReleaseWizardArgs(["--channel"])).toThrow("must be prod or beta")
  })

  test.each(["--fast", "--fs"])("%s requires authored notes before the wizard runs", (flag) => {
    expect(() => parseReleaseWizardArgs([flag])).toThrow("docs/ops/releases/notes.md")
    expect(parseReleaseWizardArgs([flag, "--help"]).help).toBe(true)
  })

  test("parses notes and titles in both flag forms", () => {
    for (const args of [
      ["--notes", "some notes.md", "--title", "Buddy Beta: calmer chats"],
      ["--notes=some notes.md", "--title=Buddy Beta: calmer chats"],
    ]) {
      expect(parseReleaseWizardArgs(args)).toMatchObject({
        notes: "some notes.md",
        title: "Buddy Beta: calmer chats",
      })
    }
    for (const args of [["--notes"], ["--title"], ["--notes="], ["--title="], ["--notes", "--fast"]]) {
      expect(() => parseReleaseWizardArgs(args)).toThrow("requires a value")
    }
  })

  test.each(["prod", "beta"] as const)("%s takes authored notes without invoking the editor", async (channel) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-authored-notes-"))
    const previous = process.env.BUDDY_CHANNEL
    const rl = createInterface({ input: new PassThrough(), output: new PassThrough() })
    try {
      process.env.BUDDY_CHANNEL = channel
      const file = path.join(directory, "notes with spaces.md")
      const notes = "- Your notebook opens faster.\n- Sources preserve <details> & links.\n"
      await Bun.write(file, notes)
      const flags = parseReleaseWizardArgs(["--channel", channel, "--fs", "--notes", file, "--title", "A calmer Buddy"])
      const draft = await editReleaseDraft(rl, "0.1.0", undefined, CURRENT_SOURCE_SHA, flags)
      expect(draft).toMatchObject({ body: notes, title: "A calmer Buddy", tempDir: undefined })
      const body = channel === "beta" ? resolveBetaDraftReleaseBody({ notes: draft.body, existingRelease: undefined }) : draft.body
      expect(channel === "beta" ? readBetaReleaseBody(body) : body).toBe(notes)
      const defaultTitle = await editReleaseDraft(rl, "0.1.0", undefined, CURRENT_SOURCE_SHA, { ...flags, title: undefined })
      expect(defaultTitle.title).toBe(channel === "beta" ? "beta-v0.1.0" : "v0.1.0")
      expect(await Bun.file(file).text()).toBe(notes)
    } finally {
      rl.close()
      if (previous === undefined) delete process.env.BUDDY_CHANNEL
      else process.env.BUDDY_CHANNEL = previous
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("selects the Beta workflow run title on beta", () => {
    const run: WorkflowRun = {
      createdAt: "2026-08-29T10:00:00Z",
      displayTitle: "beta release v0.1.0",
      event: "workflow_dispatch",
      headBranch: "beta",
      headSha: CURRENT_SOURCE_SHA,
      url: "https://example.test/beta",
    }
    expect(selectWorkflowRunUrls([run], "0.1.0", "beta").exact).toBe(run.url)
    expect(selectWorkflowRunUrls([run], "0.1.0", "prod").exact).toBeUndefined()
  })

  test.each(["prod", "beta"] as const)(
    "matches %s exact and fallback runs only on its source branch",
    (channel) => {
      const branch = channel === "beta" ? "beta" : "main"
      const title = channel === "beta" ? "beta release" : "preview candidate"
      const run: WorkflowRun = {
        createdAt: "2026-08-29T10:00:00Z",
        displayTitle: `${title} v0.1.0`,
        event: "workflow_dispatch",
        headBranch: branch,
        headSha: CURRENT_SOURCE_SHA,
        url: "https://example.test/exact",
      }
      const unrelated = [
        { ...run, headBranch: channel === "beta" ? "main" : "beta" },
        { ...run, event: "push" },
        { ...run, headBranch: "feature" },
      ]
      expect(selectWorkflowRunUrls(unrelated, "0.1.0", channel)).toEqual({
        exact: undefined,
        fallback: undefined,
      })
      const fallback = {
        ...run,
        displayTitle: `${title} v0.0.9`,
        url: "https://example.test/fallback",
      }
      expect(selectWorkflowRunUrls([...unrelated, fallback], "0.1.0", channel)).toEqual({
        exact: undefined,
        fallback: fallback.url,
      })
      expect(selectWorkflowRunUrls([...unrelated, fallback, run], "0.1.0", channel)).toEqual({
        exact: run.url,
        fallback: fallback.url,
      })
    },
  )

  test("rejects a prod plan when resuming Beta", () => {
    expect(() =>
      resolveReleaseExecution({
        channel: "beta",
        currentSourceSha: CURRENT_SOURCE_SHA,
        plan: plannedRelease(),
        repository: "buddy-hq/buddy",
        requestedTargets: { macosArm64: true, macosX64: true, windowsX64: true },
        tag: "v1.2.3",
        version: "1.2.3",
      }),
    ).toThrow("channel prod conflicts with beta")
  })
})
