import { afterEach, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  disposePreparedPublicSkillRepository,
  materializePublicSkillRepository,
  preparePublicSkillRepository,
  publishPreparedPublicSkillRepository,
  requirePublicSkillRepositoryToken,
  verifyPublicSkillRepositoryDirectory,
} from "../../script/public-skill-repository"
import {
  computeSystemSkillPackFingerprint,
  parseSystemSkillPack,
  SYSTEM_SKILL_PACK_SCHEMA_VERSION,
  SYSTEM_SKILL_RUNTIME_CONTRACT_VERSION,
  type SystemSkillPackSkill,
} from "../../src/learning/skill-management/service/system-pack"

const TEST_DIRECTORY_PREFIX = "buddy-public-skill-repository-"
const TEST_PACK_KIND = "buddy-system-skill-pack"
const TEST_SOURCE_SHA = "abc1234"
const TEST_PUBLISHED_AT = "2026-08-15T00:15:07.000Z"
const TEST_REVISION = 1
const temporaryDirectories: string[] = []

function encoded(content: string): string {
  return Buffer.from(content, "utf8").toString("base64")
}

function testPack(guide = "# Guide\n") {
  const skills: SystemSkillPackSkill[] = [
    {
      name: "example-skill",
      files: [
        {
          path: "SKILL.md",
          content: encoded(
            "---\nname: example-skill\ndescription: Example public skill.\n---\n\nUse it.\n",
          ),
        },
        {
          path: "agents/buddy.yaml",
          content: encoded("interface:\n  display_name: Example Skill\n"),
        },
        {
          path: "references/guide.md",
          content: encoded(guide),
        },
      ],
    },
  ]
  const contentFingerprint = computeSystemSkillPackFingerprint(skills)
  return parseSystemSkillPack({
    schemaVersion: SYSTEM_SKILL_PACK_SCHEMA_VERSION,
    kind: TEST_PACK_KIND,
    revision: TEST_REVISION,
    publishedAt: TEST_PUBLISHED_AT,
    runtimeContractVersion: SYSTEM_SKILL_RUNTIME_CONTRACT_VERSION,
    baseFingerprint: contentFingerprint,
    contentFingerprint,
    skills,
  })
}

async function temporaryDirectory(): Promise<string> {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), TEST_DIRECTORY_PREFIX))
  temporaryDirectories.push(directory)
  return directory
}

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim()
}

async function localRemote(): Promise<{ remote: string; root: string }> {
  const root = await temporaryDirectory()
  const remote = path.join(root, "remote.git")
  const seed = path.join(root, "seed")
  await Promise.all([fsp.mkdir(remote), fsp.mkdir(seed)])
  git(["init", "--bare"], remote)
  git(["init", "--initial-branch", "main"], seed)
  git(["config", "user.name", "Test Author"], seed)
  git(["config", "user.email", "test@example.com"], seed)
  await fsp.writeFile(path.join(seed, "README.md"), "# Public skills\n", "utf8")
  git(["add", "README.md"], seed)
  git(["commit", "-m", "Initialize repository"], seed)
  git(["remote", "add", "origin", remote], seed)
  git(["push", "origin", "main"], seed)
  return { remote, root }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fsp.rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe("public skill repository", () => {
  test("materializes only the exact files in the final system pack", async () => {
    const root = await temporaryDirectory()
    const pack = testPack()
    const staleFile = path.join(root, "skills", "stale-skill", "SKILL.md")
    await fsp.mkdir(path.dirname(staleFile), { recursive: true })
    await Promise.all([
      fsp.writeFile(staleFile, "stale\n", "utf8"),
      fsp.writeFile(path.join(root, "README.md"), "preserved\n", "utf8"),
    ])

    await materializePublicSkillRepository(pack, root)

    await expect(fsp.readFile(path.join(root, "README.md"), "utf8")).resolves.toBe(
      "preserved\n",
    )
    await expect(fsp.stat(staleFile)).rejects.toThrow()
    await expect(
      fsp.readFile(path.join(root, "skills", "example-skill", "references", "guide.md"), "utf8"),
    ).resolves.toBe("# Guide\n")

    await fsp.writeFile(path.join(root, "skills", "unexpected.txt"), "extra\n", "utf8")
    await expect(verifyPublicSkillRepositoryDirectory(pack, root)).rejects.toThrow(
      "file list does not match",
    )
    await fsp.rm(path.join(root, "skills", "unexpected.txt"))
    await fsp.writeFile(
      path.join(root, "skills", "example-skill", "references", "guide.md"),
      "# Tampered\n",
      "utf8",
    )
    await expect(verifyPublicSkillRepositoryDirectory(pack, root)).rejects.toThrow(
      "differs from the system pack",
    )
  })

  test("requires repository credentials only for public publishing", () => {
    expect(() => requirePublicSkillRepositoryToken({})).toThrow(
      "BUDDY_SKILLS_REPOSITORY_TOKEN is required",
    )
    expect(() =>
      requirePublicSkillRepositoryToken({ BUDDY_SKILLS_REPOSITORY_TOKEN: "token" }),
    ).not.toThrow()
  })

  test("publishes and verifies the prepared pack without creating duplicate commits", async () => {
    const repository = await localRemote()
    const pack = testPack()
    const input = {
      environment: process.env,
      pack,
      remoteUrl: repository.remote,
      sourceSha: TEST_SOURCE_SHA,
    }
    const first = await preparePublicSkillRepository(input)

    try {
      expect(first.changed).toBe(true)
      const published = await publishPreparedPublicSkillRepository(first)
      expect(published.changed).toBe(true)
    } finally {
      await disposePreparedPublicSkillRepository(first)
    }

    const second = await preparePublicSkillRepository(input)
    try {
      expect(second.changed).toBe(false)
      const published = await publishPreparedPublicSkillRepository(second)
      expect(published.changed).toBe(false)
    } finally {
      await disposePreparedPublicSkillRepository(second)
    }
  })
})
