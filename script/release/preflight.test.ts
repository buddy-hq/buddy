import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import type { BuddyDistributionId } from "@buddy/script/distribution"
import type { GithubCheckRun } from "./preflight"

const SOURCE_SHA = "a".repeat(40)
const GREEN_CHECKS: readonly GithubCheckRun[] = [
  { name: "Check", status: "completed", conclusion: "success" },
  { name: "vendor-guard", status: "completed", conclusion: "success" },
]

async function preflightFixture(input: {
  channel?: BuddyDistributionId
  refName: string
  comparison?: "ahead" | "behind" | "diverged" | "identical"
  checks?: readonly GithubCheckRun[]
}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-release-preflight-"))
  try {
    const bin = path.join(directory, "bin")
    await mkdir(bin)
    const statePath = path.join(directory, "state.json")
    await Bun.write(
      statePath,
      JSON.stringify({
        comparison: input.comparison ?? "identical",
        checks: input.checks ?? GREEN_CHECKS,
      }),
    )
    const callsPath = path.join(directory, "calls.jsonl")
    await Bun.write(callsPath, "")
    const gh = path.join(bin, "gh")
    await Bun.write(
      gh,
      `#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs"
const args = process.argv.slice(2)
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + "\\n")
const state = JSON.parse(readFileSync(process.env.FIXTURE_STATE, "utf8"))
if (args[0] !== "api") throw new Error("Unexpected gh command")
if (args.some((arg) => arg.includes("/compare/"))) {
  console.log(JSON.stringify({ status: state.comparison }))
} else if (args.some((arg) => arg.endsWith("/check-runs"))) {
  console.log(JSON.stringify([{ check_runs: state.checks }]))
} else {
  throw new Error("Unexpected gh API endpoint")
}
`,
    )
    await chmod(gh, 0o755)
    const result = spawnSync(process.execPath, [path.resolve(import.meta.dir, "preflight.ts")], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        BUDDY_CHANNEL: input.channel ?? "",
        BUDDY_RELEASE_SOURCE_REPOSITORY: "buddy-hq/buddy",
        BUDDY_RELEASE_SOURCE_SHA: SOURCE_SHA,
        GITHUB_REF_NAME: input.refName,
        FIXTURE_CALLS: callsPath,
        FIXTURE_STATE: statePath,
      },
      encoding: "utf8",
    })
    const log = (await Bun.file(callsPath).text()).trim()
    const calls = z
      .array(z.array(z.string()))
      .parse(log ? log.split("\n").map((line) => JSON.parse(line)) : [])
    return { result, calls }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe("release preflight CLI", () => {
  test("defaults to prod and preserves the green main message", async () => {
    const { result, calls } = await preflightFixture({ refName: "main" })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(
      `Verified buddy-hq/buddy@${SOURCE_SHA} is a green main commit (Check, vendor-guard)\n`,
    )
    expect(calls).toContainEqual(["api", `repos/buddy-hq/buddy/compare/${SOURCE_SHA}...main`])
  })

  for (const channel of ["prod", "beta"] as const) {
    const branch = channel === "beta" ? "beta" : "main"

    test.each(["identical", "ahead"] as const)(
      `accepts an %s source on ${branch} with green checks`,
      async (comparison) => {
        const { result, calls } = await preflightFixture({ channel, refName: branch, comparison })
        expect(result.status).toBe(0)
        expect(result.stdout).toContain(`is a green ${branch} commit (Check, vendor-guard)`)
        expect(calls).toContainEqual([
          "api",
          `repos/buddy-hq/buddy/compare/${SOURCE_SHA}...${branch}`,
        ])
        expect(calls).toContainEqual([
          "api",
          "--paginate",
          "--slurp",
          "--method",
          "GET",
          `repos/buddy-hq/buddy/commits/${SOURCE_SHA}/check-runs`,
          "-f",
          "per_page=100",
          "-f",
          "filter=latest",
        ])
      },
    )

    test.each([channel === "beta" ? "main" : "beta", "v1.2.3"])(
      `rejects dispatch ref %s for ${channel} before GitHub calls`,
      async (refName) => {
        const { result, calls } = await preflightFixture({ channel, refName })
        expect(result.status).toBe(1)
        expect(result.stderr).toContain(
          `Release workflow must be dispatched from ${branch}, received ${refName}`,
        )
        expect(calls).toEqual([])
      },
    )

    test.each(["behind", "diverged"] as const)(
      `rejects a source %s from ${branch}`,
      async (comparison) => {
        const { result } = await preflightFixture({ channel, refName: branch, comparison })
        expect(result.status).toBe(1)
        expect(result.stderr).toContain(
          `Release source is not an ancestor of ${branch}: ${comparison}`,
        )
      },
    )

    test.each([
      ["failed", { name: "vendor-guard", status: "completed", conclusion: "failure" }],
      ["pending", { name: "vendor-guard", status: "in_progress", conclusion: null }],
      ["missing", { name: "unrelated", status: "completed", conclusion: "success" }],
    ] as const)(`rejects %s vendor checks for ${channel}`, async (_state, check) => {
      const { result } = await preflightFixture({
        channel,
        refName: branch,
        checks: [{ name: "Check", status: "completed", conclusion: "success" }, check],
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        "Release source has not passed required checks: vendor-guard=",
      )
    })
  }
})
