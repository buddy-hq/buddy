import { describe, expect, test } from "bun:test"
import { createHash, generateKeyPairSync } from "node:crypto"
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { z } from "zod"
import { renderReleaseFreeze } from "./freeze"

const ROOT = path.resolve(import.meta.dir, "../..")
const REPOSITORY = "prashantbhudwal/buddy-beta-releases"
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
  } = {},
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-beta-publication-"))
  try {
    for (const relative of [
      "packages/script/src/index.ts",
      "packages/script/src/distribution.ts",
      "packages/script/src/branding.ts",
      "packages/script/src/release-version.ts",
      "script/publish.ts",
      "script/version.ts",
      "script/changelog.ts",
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
        : { ...freeze, channel: "beta" as const }
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
        isPrerelease: input.prerelease ?? false,
        tagName: "v0.1.0",
        databaseId: 123,
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
    const releases = state.highest ? [{ tag_name: "v" + state.highest, draft: false, prerelease: false }] : []
    console.log(JSON.stringify([releases]))
  } else {
    console.log(JSON.stringify({ ref: "refs/tags/beta-v0.1.0", object: { type: "commit", sha: "${SOURCE_SHA}" } }))
  }
} else if (args[1] === "download") {
  copyFileSync(process.env.FIXTURE_FREEZE, path.join(args[args.indexOf("--dir") + 1], "buddy-release-freeze.json"))
} else if (args[1] === "edit") {
  state.isDraft = false
  state.isPrerelease = args.includes("--prerelease")
  writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state))
} else if (args[1] === "list") {
  console.log("[]")
} else if (args[1] === "create") {
  state.exists = true
  state.assets = []
  writeFileSync(process.env.FIXTURE_STATE, JSON.stringify(state))
} else if (args[1] === "view") {
  if (!state.exists) process.exit(1)
  console.log(JSON.stringify(state))
} else { throw new Error("Unexpected gh command: " + args.join(" ")) }
`,
    )
    await chmod(gh, 0o755)
    const git = path.join(bin, "git")
    await Bun.write(git, '#!/bin/bash\nif [[ "$1" == "rev-list" ]]; then exit 0; fi\necho main\n')
    await chmod(git, 0o755)
    const runnerTemp = path.join(directory, "runner")
    await mkdir(runnerTemp)
    const result = spawnSync(process.execPath, [`script/${input.script ?? "publish"}.ts`], {
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
        BUDDY_RELEASE_TAG: "v0.1.0",
        BUDDY_RELEASE_TARGET_MACOS_ARM64: "true",
        BUDDY_RELEASE_TARGET_MACOS_X64: input.partial ? "false" : "true",
        BUDDY_RELEASE_TARGET_WINDOWS_X64: "true",
        BUDDY_RELEASE_SOURCE_REPOSITORY: "buddy-hq/buddy",
        BUDDY_RELEASE_SOURCE_SHA: SOURCE_SHA,
        BUDDY_RELEASE_PLAN_DIGEST: PLAN_DIGEST,
        BUDDY_RELEASE_DRY_RUN: "",
        GITHUB_REF_NAME: "main",
        GITHUB_REF_TYPE: "branch",
        GITHUB_OUTPUT: path.join(directory, "outputs.txt"),
        RUNNER_TEMP: runnerTemp,
        FIXTURE_STATE: statePath,
        FIXTURE_CALLS: logPath,
        FIXTURE_FREEZE: freezePath,
      },
      encoding: "utf8",
    })
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
  test("publishes a frozen draft as non-prerelease latest", async () => {
    const { result, calls } = await publicationFixture()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Published Beta")
    expect(calls.find((call) => call[1] === "edit")).toEqual([
      "release",
      "edit",
      "v0.1.0",
      "--draft=false",
      "--prerelease=false",
      "--latest",
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

  test("rejects a prod freeze in the Beta repo", async () => {
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

  test("rejects a prod repo override before any GitHub call", async () => {
    const { result, calls } = await publicationFixture({
      repository: "prashantbhudwal/buddy-releases",
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
    expect(result.stderr).toContain("must be non-prerelease and frozen")
  })

  test("creates a first Beta draft with numeric release-repo tag", async () => {
    const { result, calls, outputs } = await publicationFixture({
      script: "version",
      exists: false,
    })
    expect(result.status).toBe(0)
    const create = calls.find((call) => call[1] === "create")
    expect(create?.slice(0, 4)).toEqual(["release", "create", "v0.1.0", "-d"])
    expect(create).toContain(REPOSITORY)
    expect(outputs).toContain("tag=v0.1.0")
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
      highest: "0.1.0",
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
