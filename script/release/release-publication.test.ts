import { describe, expect, test } from "bun:test"
import { createHash, generateKeyPairSync } from "node:crypto"
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { z } from "zod"
import { renderReleaseFreeze } from "./freeze"
import { formatBetaReleaseBody, readBetaReleaseBody } from "@buddy/script/release-stream"

const ROOT = path.resolve(import.meta.dir, "../..")
const REPOSITORY = "prashantbhudwal/buddy-releases"
const SOURCE_SHA = "1".repeat(40)
const PLAN_DIGEST = "2".repeat(64)
const testKey = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "der" })
  .subarray(-32)
const TEST_PUBLIC_KEY = Buffer.concat([Buffer.from("Ed"), Buffer.alloc(8, 7), testKey]).toString(
  "base64",
)

async function publicationFixture(
  input: {
    script?: "publish" | "version" | "release-source-tag" | "release/distribution-guard"
    channel?: "beta" | "prod"
    draft?: boolean
    prerelease?: boolean
    highest?: string
    freezeChannel?: "beta" | "prod"
    provisionKey?: boolean
    repository?: string
    frozen?: boolean
    exists?: boolean
    partial?: boolean
    refName?: string
    releaseTag?: string
    notesHistory?: "first" | "later" | "no-stable"
    notesBody?: string
  } = {},
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-beta-publication-"))
  try {
    for (const relative of [
      "packages/script/src/index.ts",
      "packages/script/src/distribution.ts",
      "packages/script/src/branding.ts",
      "packages/script/src/release-version.ts",
      "packages/script/src/release-stream.ts",
      "script/publish.ts",
      "script/release/shared-repository-publication.ts",
      "script/release/shared-repository-guard.ts",
      "script/release/shared-repository-github.ts",
      "script/release/installed-stable-readers.ts",
      "script/version.ts",
      "script/changelog.ts",
      "script/release/notes.ts",
      "script/release/notes-input.ts",
      "packages/update-contract/src/release-notes.ts",
      "script/release-repositories.ts",
      "script/release-source-tag.ts",
      "script/release/assets.ts",
      "script/release/freeze.ts",
      "script/release/constants.ts",
      "script/release/distribution-guard.ts",
      "script/release/beta-publication.ts",
      "script/release/github-output.ts",
    ]) {
      const target = path.join(directory, relative)
      await mkdir(path.dirname(target), { recursive: true })
      let source = await Bun.file(path.join(ROOT, relative)).text()
      if (relative.endsWith("distribution.ts")) {
        // Provision only this isolated deployment; the shared contract is never edited.
        const betaStart = source.indexOf("  beta: {")
        const betaKey = input.provisionKey === false ? "null" : JSON.stringify(TEST_PUBLIC_KEY)
        source =
          source.slice(0, betaStart) +
          source
            .slice(betaStart)
            .replace(/updaterPublicKey: (?:null|"[^"]*"),/u, `updaterPublicKey: ${betaKey},`)
      }
      await Bun.write(target, source)
    }
    await Bun.write(
      path.join(directory, "package.json"),
      JSON.stringify({ type: "module", packageManager: "bun@1.3.13" }),
    )
    await Bun.write(
      path.join(directory, "packages/script/package.json"),
      JSON.stringify({
        name: "@buddy/script",
        type: "module",
        exports: {
          ".": "./src/index.ts",
          "./distribution": "./src/distribution.ts",
          "./release-version": "./src/release-version.ts",
          "./release-stream": "./src/release-stream.ts",
        },
      }),
    )
    const modules = path.join(directory, "node_modules")
    await mkdir(path.join(modules, "@buddy"), { recursive: true })
    await symlink(path.join(directory, "packages/script"), path.join(modules, "@buddy/script"))
    await symlink(path.join(ROOT, "node_modules/zod"), path.join(modules, "zod"))
    const payload = Buffer.from("Beta test payload")
    const freeze = {
      assets: [
        {
          name: "payload.zip",
          sha256: createHash("sha256").update(payload).digest("hex"),
          size: payload.length,
        },
      ],
      planDigest: PLAN_DIGEST,
      schemaVersion: 1 as const,
      sourceRepository: "buddy-hq/buddy",
      sourceSha: SOURCE_SHA,
      tag: "v0.1.0",
      version: "0.1.0",
    }
    const boundFreeze =
      (input.freezeChannel ?? input.channel) === "prod"
        ? freeze
        : { ...freeze, channel: "beta" as const, tag: "beta-v0.1.0" }
    const freezePath = path.join(directory, "freeze.json")
    await Bun.write(freezePath, renderReleaseFreeze(boundFreeze))
    const freezeBytes = await Bun.file(freezePath).bytes()
    const assets = [
      {
        apiUrl: "https://api.github.com/asset/1",
        digest: `sha256:${freeze.assets[0]!.sha256}`,
        name: "payload.zip",
        size: payload.length,
      },
      ...(input.frozen === false
        ? []
        : [
            {
              apiUrl: "https://api.github.com/asset/2",
              digest: `sha256:${createHash("sha256").update(freezeBytes).digest("hex")}`,
              name: "buddy-release-freeze.json",
              size: freezeBytes.length,
            },
          ]),
    ]
    const statePath = path.join(directory, "state.json")
    await Bun.write(
      statePath,
      JSON.stringify({
        exists: input.exists !== false,
        isDraft: input.draft !== false,
        isPrerelease: input.prerelease ?? input.channel !== "prod",
        tagName: input.channel === "prod" ? "v0.1.0" : "beta-v0.1.0",
        databaseId: 123,
        body:
          input.notesBody ??
          (input.channel === "prod"
            ? "- Your notebook opens faster."
            : formatBetaReleaseBody("Beta test notes")),
        url: `https://github.com/${REPOSITORY}/releases/tag/${input.channel === "prod" ? "v" : "beta-v"}0.1.0`,
        assets,
        highest: input.highest,
      }),
    )
    const logPath = path.join(directory, "calls.jsonl")
    const bin = path.join(directory, "bin")
    await mkdir(bin)
    const gh = path.join(bin, "gh")
    await Bun.write(
      gh,
      `#!${process.execPath}
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
const args = process.argv.slice(2)
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + "\\n")
const state = JSON.parse(readFileSync(process.env.FIXTURE_STATE, "utf8"))
if (args[0] === "api") {
  if (args.includes("--slurp")) {
    const stable = { tag_name: "v0.0.79", draft: false, prerelease: false, body: "", html_url: "https://github.com/${REPOSITORY}/releases/tag/v0.0.79" }
    const previous = state.highest ? [{ tag_name: (process.env.BUDDY_CHANNEL === "prod" ? "v" : "beta-v") + state.highest, draft: false, prerelease: process.env.BUDDY_CHANNEL !== "prod", body: state.body, html_url: state.url }] : []
    const current = state.exists ? [{ tag_name: state.tagName, draft: state.isDraft, prerelease: state.isPrerelease, body: state.body, html_url: state.url }] : []
    console.log(JSON.stringify([[...current, ...previous.filter((release) => release.tag_name !== state.tagName), stable]]))
  } else if (args.some((arg) => arg.endsWith("/releases/latest"))) {
    console.log(JSON.stringify({ tag_name: "v0.0.79", draft: false, prerelease: false, body: "", html_url: "https://github.com/${REPOSITORY}/releases/tag/v0.0.79" }))
  } else {
    console.log(JSON.stringify({ ref: "refs/tags/beta-v0.1.0", object: { type: "commit", sha: "${SOURCE_SHA}" } }))
  }
} else if (args[1] === "download") {
  copyFileSync(process.env.FIXTURE_FREEZE, path.join(args[args.indexOf("--dir") + 1], "buddy-release-freeze.json"))
} else if (args[1] === "edit") {
  state.isDraft = false
  state.isPrerelease = args.includes("--prerelease")
  if (args.includes("--notes-file")) state.body = readFileSync(args[args.indexOf("--notes-file") + 1], "utf8")
  writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state))
} else if (args[1] === "list") {
  console.log("[]")
} else if (args[1] === "create") {
  state.exists = true
  state.assets = []
  state.body = readFileSync(args[args.indexOf("--notes-file") + 1], "utf8")
  writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state))
} else if (args[1] === "view") {
  if (!state.exists) process.exit(1)
  console.log(JSON.stringify(state))
} else { throw new Error("Unexpected gh command: " + args.join(" ")) }
`,
    )
    await chmod(gh, 0o755)
    const git = path.join(bin, "git")
    await Bun.write(
      git,
      `#!/bin/bash\nif [[ "$1" == "rev-list" ]]; then exit 0; fi\necho ${input.channel === "prod" ? "main" : "beta"}\n`,
    )
    await chmod(git, 0o755)
    let notesSourceSha: string | undefined
    if (input.notesHistory) {
      await rm(git)
      const runGit = (...args: string[]) => {
        const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" })
        if (result.status !== 0) throw new Error(result.stderr)
        return result.stdout.trim()
      }
      runGit("init", "--initial-branch=beta")
      runGit("config", "user.name", "Release notes fixture")
      runGit("config", "user.email", "release-notes@example.test")
      const feature = path.join(directory, "packages/web/feature.ts")
      const commit = async (message: string) => {
        await Bun.write(feature, message)
        await Bun.write(path.join(directory, "message.txt"), message)
        runGit("add", "packages/web/feature.ts")
        runGit("commit", "--quiet", "--file", "message.txt")
      }
      await commit(`feat: Historic change ${"old history ".repeat(12_000)}`)
      if (input.notesHistory !== "no-stable") {
        runGit("tag", "v0.0.78")
        await commit("feat: Stable changes")
        runGit("tag", "v0.0.79")
        runGit("checkout", "--quiet", "-b", "unmerged")
        await commit("feat: Unmerged Stable changes")
        runGit("tag", "v99.0.0")
        runGit("checkout", "--quiet", "beta")
      }
      await commit("feat: First Beta changes <&>")
      if (input.notesHistory === "later") {
        runGit("tag", "beta-v0.0.9")
        await commit("feat: Later Beta changes")
      } else {
        await commit(`feat: Large Beta change ${"<&>".repeat(30_000)}`)
        await commit("feat: Tail after oversized line")
      }
      notesSourceSha = runGit("rev-parse", "HEAD")
    }
    const runnerTemp = path.join(directory, "runner")
    await mkdir(runnerTemp)
    const invocation = {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_REPO: "",
        BUDDY_CHANNEL: input.channel ?? "beta",
        BUDDY_RELEASE_REPO:
          input.repository ??
          (input.channel === "prod" ? "prashantbhudwal/buddy-releases" : REPOSITORY),
        BUDDY_SOURCE_REPO: "buddy-hq/buddy",
        BUDDY_VERSION: "0.1.0",
        BUDDY_RELEASE: "123",
        BUDDY_RELEASE_TAG:
          input.releaseTag ?? (input.channel === "prod" ? "v0.1.0" : "beta-v0.1.0"),
        BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
        BUDDY_RELEASE_TARGET_MACOS_X64: input.partial ? "false" : "true",
        BUDDY_RELEASE_TARGET_WINDOWS_X64: "true",
        BUDDY_RELEASE_SOURCE_REPOSITORY: "buddy-hq/buddy",
        BUDDY_RELEASE_SOURCE_SHA: notesSourceSha ?? SOURCE_SHA,
        BUDDY_RELEASE_PLAN_DIGEST: PLAN_DIGEST,
        BUDDY_RELEASE_DRY_RUN: "",
        GITHUB_REF_NAME: input.refName ?? (input.channel === "prod" ? "main" : "beta"),
        GITHUB_REF_TYPE: "branch",
        GITHUB_OUTPUT: path.join(directory, "outputs.txt"),
        RUNNER_TEMP: runnerTemp,
        FIXTURE_STATE: statePath,
        FIXTURE_CALLS: logPath,
        FIXTURE_FREEZE: freezePath,
      },
      encoding: "utf8",
    } as const
    const wizard = input.notesHistory
      ? spawnSync(
          process.execPath,
          [
            "--eval",
            `import { initialReleaseBody } from ${JSON.stringify(path.join(ROOT, "script/cut-release.ts"))}; import { buildReleaseNotes, limitReleaseBody } from ${JSON.stringify(path.join(ROOT, "script/changelog.ts"))}; import { resolveBetaDraftReleaseBody } from ${JSON.stringify(path.join(ROOT, "script/release/beta-publication.ts"))}; const raw = await initialReleaseBody("0.1.0", undefined); const notes = await buildReleaseNotes(${JSON.stringify(input.highest)}, "HEAD"); console.log(JSON.stringify({ raw, body: limitReleaseBody(resolveBetaDraftReleaseBody({ notes, existingRelease: undefined })) }));`,
          ],
          invocation,
        )
      : undefined
    const result = spawnSync(
      process.execPath,
      [`script/${input.script ?? "publish"}.ts`],
      invocation,
    )
    const calls = (await Bun.file(logPath).exists())
      ? z.array(z.array(z.string())).parse(
          (await Bun.file(logPath).text())
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line)),
        )
      : []
    return {
      result,
      wizard,
      body: z.object({ body: z.string() }).parse(await Bun.file(statePath).json()).body,
      calls,
      outputs: (await Bun.file(path.join(directory, "outputs.txt")).exists())
        ? await Bun.file(path.join(directory, "outputs.txt")).text()
        : "",
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe("Beta publication CLI", () => {
  test.each(["prod", "beta"] as const)(
    "version keeps the authored %s draft body verbatim",
    async (channel) => {
      const notes = "- Your chat stays responsive.  \n- Opening Sources works again.\n"
      const body =
        channel === "beta" ? formatBetaReleaseBody(notes).replaceAll("\n", "\r\n") : notes
      const fixture = await publicationFixture({ script: "version", channel, notesBody: body })
      expect(fixture.result.status).toBe(0)
      expect(fixture.body).toBe(body)
      expect(fixture.calls.some((call) => call[1] === "create" || call[1] === "edit")).toBe(false)
      expect(
        fixture.calls.some(
          (call) => call.includes("--json") && call.some((arg) => arg.split(",").includes("body")),
        ),
      ).toBe(true)
    },
  )

  test("version refuses an unedited raw-input draft", async () => {
    const fixture = await publicationFixture({
      script: "version",
      notesBody: formatBetaReleaseBody(
        "# Raw release notes input — replace with user-facing notes\n- deadbee fix: raw",
      ),
    })
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toContain("Replace the raw input")
    expect(fixture.calls.some((call) => call[1] === "create" || call[1] === "edit")).toBe(false)
  })
  test("first Beta raw input and bounded fallback use the ancestor Stable baseline", async () => {
    const { result, wizard, calls } = await publicationFixture({
      script: "version",
      exists: false,
      notesHistory: "first",
    })
    expect(wizard?.status).toBe(0)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("No draft release")
    expect(calls.some((call) => call[1] === "create")).toBe(false)
    const { body, raw } = z
      .object({ body: z.string(), raw: z.string() })
      .parse(JSON.parse(wizard?.stdout.trim() ?? ""))
    expect(raw).toContain("Range: `v0.0.79..HEAD`")
    expect(body.length).toBeLessThanOrEqual(120_000)
    expect(readBetaReleaseBody(body)).toBe(
      "## Web\n- feat: First Beta changes <&>\nRelease notes truncated to fit GitHub's size limit.",
    )
    expect(body).toBe(formatBetaReleaseBody(readBetaReleaseBody(body) ?? ""))
  })

  test("later Beta raw input and fallback still diff from the previous Beta", async () => {
    const { result, wizard } = await publicationFixture({
      script: "version",
      exists: false,
      highest: "0.0.9",
      notesHistory: "later",
    })
    expect(wizard?.status).toBe(0)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("No draft release")
    const { body, raw } = z
      .object({ body: z.string(), raw: z.string() })
      .parse(JSON.parse(wizard?.stdout.trim() ?? ""))
    expect(raw).toContain("Range: `beta-v0.0.9..HEAD`")
    expect(readBetaReleaseBody(body)).toBe("## Web\n- feat: Later Beta changes")
  })

  test("first Beta without an ancestor Stable keeps the fixed-note fallback", async () => {
    const { result, wizard } = await publicationFixture({
      script: "version",
      exists: false,
      notesHistory: "no-stable",
    })
    expect(wizard?.status).toBe(0)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("No draft release")
    const { body } = z.object({ body: z.string() }).parse(JSON.parse(wizard?.stdout.trim() ?? ""))
    expect(readBetaReleaseBody(body)).toMatch(
      /^This is the first Buddy Beta, built from beta at [a-f0-9]{7,40}\.$/u,
    )
  })

  test("publishes a frozen draft as prerelease and never latest", async () => {
    const { result, calls } = await publicationFixture()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Published Beta")
    expect(calls.find((call) => call[1] === "edit")).toEqual([
      "release",
      "edit",
      "beta-v0.1.0",
      "--draft=false",
      "--prerelease",
      "--latest=false",
      "--notes-file",
      expect.any(String),
      "--repo",
      REPOSITORY,
    ])
  })

  test("retries an already-published frozen Beta without editing it", async () => {
    const { result, calls } = await publicationFixture({ draft: false, highest: "0.1.0" })
    expect(result.status).toBe(0)
    expect(calls.some((call) => call[1] === "edit")).toBe(false)
  })

  test("rejects a lower version before changing latest", async () => {
    const { result, calls } = await publicationFixture({ highest: "0.2.0" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("refusing to move latest backward")
    expect(calls.some((call) => call[1] === "edit")).toBe(false)
    expect(calls.find((call) => call[0] === "api")).toContain("--paginate")
  })

  test("rejects a prod freeze for a Beta release", async () => {
    const { result, calls } = await publicationFixture({ freezeChannel: "prod" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("channel prod conflicts with beta")
    expect(calls.some((call) => call[1] === "edit")).toBe(false)
  })

  test("fails closed without a provisioned Beta public key", async () => {
    const { result, calls } = await publicationFixture({ provisionKey: false })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("no updater public key provisioned")
    expect(calls).toEqual([])
  })

  test("rejects the obsolete Beta repo override before any GitHub call", async () => {
    const { result, calls } = await publicationFixture({
      repository: "prashantbhudwal/buddy-beta-releases",
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("conflicts with beta")
    expect(calls).toEqual([])
  })

  test("version resolution accepts a frozen published Beta retry", async () => {
    const { result, calls, outputs } = await publicationFixture({
      script: "version",
      draft: false,
      highest: "0.1.0",
    })
    expect(result.status).toBe(0)
    expect(outputs).toContain(`release_repo=${REPOSITORY}`)
    expect(calls.some((call) => call[1] === "create" || call[1] === "edit")).toBe(false)
  })

  test("version resolution rejects an unfrozen published Beta", async () => {
    const { result } = await publicationFixture({ script: "version", draft: false, frozen: false })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("must be prerelease and frozen")
  })

  test("requires a writer to replace generated input when no draft exists", async () => {
    const { result, calls, outputs } = await publicationFixture({
      script: "version",
      exists: false,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("docs/ops/releases/notes.md")
    expect(calls.some((call) => call[1] === "create" || call[1] === "edit")).toBe(false)
    expect(outputs).toBe("")
  })

  test.each([
    ["prod", "beta", "Preview release candidates must be cut from main, received 'beta'"],
    ["beta", "main", "Beta releases must be cut from beta, received 'main'"],
  ] as const)(
    "version resolution rejects the other source branch for %s",
    async (channel, refName, message) => {
      const { result, calls } = await publicationFixture({ script: "version", channel, refName })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(message)
      expect(calls).toEqual([])
    },
  )

  test("version resolution keeps prod drafts on main", async () => {
    const { result, calls, outputs } = await publicationFixture({
      script: "version",
      channel: "prod",
    })
    expect(result.status).toBe(0)
    expect(outputs).toContain("release_repo=prashantbhudwal/buddy-releases")
    expect(calls.some((call) => call[1] === "create" || call[1] === "edit")).toBe(false)
    expect(calls.some((call) => call.includes("--slurp"))).toBe(false)
  })

  test("rejects a partial first Beta release in preflight", async () => {
    const { result, calls } = await publicationFixture({
      script: "release/distribution-guard",
      partial: true,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("first Beta release requires all three targets")
    expect(calls.some((call) => call[1] === "create" || call[1] === "edit")).toBe(false)
  })

  test("allows partial Beta releases after a published Beta exists", async () => {
    const { result } = await publicationFixture({
      script: "release/distribution-guard",
      partial: true,
      highest: "0.0.9",
    })
    expect(result.status).toBe(0)
  })

  test("keeps prod draft publication flags and behavior unchanged", async () => {
    const { result, calls } = await publicationFixture({ channel: "prod" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Published Preview")
    expect(calls.find((call) => call[1] === "edit")).toEqual([
      "release",
      "edit",
      "v0.1.0",
      "--draft=false",
      "--prerelease",
      "--latest=false",
      "--repo",
      "prashantbhudwal/buddy-releases",
    ])
    expect(calls.some((call) => call.includes("--slurp"))).toBe(false)
  })

  test("keeps published Preview retries as no-ops", async () => {
    const { result, calls } = await publicationFixture({
      channel: "prod",
      draft: false,
      prerelease: true,
    })
    expect(result.status).toBe(0)
    expect(calls.some((call) => call[1] === "edit")).toBe(false)
  })

  test("still rejects republishing an already-stable prod release", async () => {
    const { result, calls } = await publicationFixture({ channel: "prod", draft: false })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("already stable and cannot be republished")
    expect(calls.some((call) => call[1] === "edit")).toBe(false)
  })

  test("source provenance looks up the beta-v namespace", async () => {
    const { result, calls } = await publicationFixture({ script: "release-source-tag" })
    expect(result.status).toBe(0)
    expect(calls).toEqual([["api", "repos/buddy-hq/buddy/git/ref/tags/beta-v0.1.0"]])
  })
})

describe("Beta retry and tag boundaries", () => {
  test("preflight validates the selected namespace before version resolution has emitted a tag", async () => {
    const { result, calls } = await publicationFixture({
      script: "release/distribution-guard",
      releaseTag: "",
    })
    expect(result.status).toBe(0)
    expect(calls).toEqual([])
  })

  test("version resolution refuses a published Beta that is not a prerelease", async () => {
    const { result, calls } = await publicationFixture({
      script: "version",
      draft: false,
      prerelease: false,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("must be prerelease and frozen")
    expect(calls.some((call) => call[1] === "create" || call[1] === "edit")).toBe(false)
  })

  test.each(["version", "release-source-tag", "release/distribution-guard"] as const)(
    "%s refuses a prod tag for Beta before any GitHub call",
    async (script) => {
      const { result, calls } = await publicationFixture({ script, releaseTag: "v0.1.0" })
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/does not belong|does not match/u)
      expect(calls).toEqual([])
    },
  )
})
