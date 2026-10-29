import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "../..")

async function inputFixture(
  input: { channel?: "prod" | "beta"; later?: boolean; noStable?: boolean; bulk?: boolean } = {},
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-notes-input-"))
  try {
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" })
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout.trim()
    }
    git("init", "--initial-branch=beta")
    git("config", "user.name", "Notes input fixture")
    git("config", "user.email", "notes@example.test")
    git("commit", "--allow-empty", "--quiet", "-m", "feat: Ancient changes")
    if (!input.noStable) git("tag", "v0.0.1")
    git("commit", "--allow-empty", "--quiet", "-m", "feat: Notebook opening")
    git("tag", "beta-v0.1.0")
    git("commit", "--allow-empty", "--quiet", "-m", "fix: Sources links")
    for (const prefix of ["test", "ci", "chore", "ignore", "release"]) {
      git("commit", "--allow-empty", "--quiet", "-m", `${prefix}: Internal change`)
    }
    if (input.bulk) {
      const parent = git("rev-parse", "HEAD")
      const stream = Array.from({ length: 405 }, (_, index) => {
        const message = `feat: Bulk change ${index}`
        return `commit refs/heads/beta\ncommitter Notes fixture <notes@example.test> ${1700000000 + index} +0000\ndata ${message.length}\n${message}\n${index === 0 ? `from ${parent}\n` : ""}\n`
      }).join("")
      const result = spawnSync("git", ["fast-import", "--quiet"], {
        cwd: directory,
        input: stream,
        encoding: "utf8",
      })
      if (result.status !== 0) throw new Error(result.stderr)
    }
    const bin = path.join(directory, "bin")
    await mkdir(bin)
    const gh = path.join(bin, "gh")
    const releases = [
      { tag_name: "v0.0.1", draft: false, prerelease: false },
      ...(input.later ? [{ tag_name: "beta-v0.1.0", draft: false, prerelease: true }] : []),
      { tag_name: "beta-v99.0.0", draft: true, prerelease: true },
    ]
    await Bun.write(
      gh,
      `#!${process.execPath}\nconst args = process.argv.slice(2); if (args[0] !== "api" || !args.includes("--paginate") || !args.includes("--slurp")) throw new Error("Only paginated release reads are allowed"); console.log(${JSON.stringify(JSON.stringify([releases]))});\n`,
    )
    await chmod(gh, 0o755)
    return spawnSync(
      process.execPath,
      [path.join(ROOT, "script/release/notes-input.ts"), "--channel", input.channel ?? "beta"],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          BUDDY_CHANNEL: "prod",
          GH_REPO: "",
          BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
        },
      },
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe("raw release notes input", () => {
  test("first Beta uses the bounded Stable baseline and skips ignored subjects", async () => {
    const result = await inputFixture()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Range: `v0.0.1..HEAD`")
    expect(result.stdout).toMatch(/- [0-9a-f]{7,40} feat: Notebook opening/u)
    expect(result.stdout).toContain("fix: Sources links")
    expect(result.stdout).not.toContain("Ancient changes")
    expect(result.stdout).not.toContain("Internal change")
    expect(result.stdout).toContain("0 commits left out.")
  })

  test("later Beta ranges from its previous published Beta", async () => {
    const result = await inputFixture({ later: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Range: `beta-v0.1.0..HEAD`")
    expect(result.stdout).toContain("fix: Sources links")
    expect(result.stdout).not.toContain("Notebook opening")
  })

  test("prod stays in its own release namespace", async () => {
    const result = await inputFixture({ channel: "prod", later: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Range: `v0.0.1..HEAD`")
    expect(result.stdout).toContain("Notebook opening")
  })

  test("first Beta with no ancestor Stable does not dump repository history", async () => {
    const result = await inputFixture({ noStable: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("first Buddy Beta, built from beta at")
    expect(result.stdout).not.toContain("Ancient changes")
  })

  test("caps eligible commits at 400 and reports the omitted count", async () => {
    const result = await inputFixture({ bulk: true })
    expect(result.status).toBe(0)
    expect(result.stdout.split("\n").filter((line) => /^- [0-9a-f]+ /u.test(line))).toHaveLength(
      400,
    )
    expect(result.stdout).toContain("7 commits left out.")
  })
})
