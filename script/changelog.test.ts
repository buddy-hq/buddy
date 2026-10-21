import { describe, expect, test } from "bun:test"
import { latestReleaseVersionFromReleases, changelogSourceRef } from "./changelog"

const release = (tag_name: string, prerelease = true, draft = false) => ({
  tag_name,
  prerelease,
  draft,
})

describe("changelog release version helpers", () => {
  test("selects the highest stable semver release by default", () => {
    expect(
      latestReleaseVersionFromReleases([
        {
          isDraft: false,
          isPrerelease: false,
          tagName: "v1.2.0",
        },
        {
          isDraft: false,
          isPrerelease: true,
          tagName: "v1.4.0",
        },
        {
          isDraft: false,
          isPrerelease: false,
          tagName: "v1.3.0",
        },
        {
          isDraft: true,
          isPrerelease: false,
          tagName: "v9.0.0",
        },
      ]),
    ).toBe("1.3.0")
  })

  test("can include Preview candidates when choosing the next release tag", () => {
    expect(
      latestReleaseVersionFromReleases(
        [
          {
            isDraft: false,
            isPrerelease: false,
            tagName: "v1.3.0",
          },
          {
            isDraft: false,
            isPrerelease: true,
            tagName: "v1.4.0",
          },
        ],
        { includePrereleases: true },
      ),
    ).toBe("1.4.0")
  })

  test("skips an existing tag when requested", () => {
    expect(
      latestReleaseVersionFromReleases(
        [
          {
            isDraft: false,
            isPrerelease: false,
            tagName: "v1.3.0",
          },
          {
            isDraft: false,
            isPrerelease: false,
            tagName: "v1.2.0",
          },
        ],
        { skip: "v1.3.0" },
      ),
    ).toBe("1.2.0")
  })
})

test("keeps Beta changelog provenance in its source tag namespace", () => {
  expect(changelogSourceRef("v1.2.3", undefined, {})).toBe("v1.2.3")
  expect(changelogSourceRef("0.1.0", undefined, { BUDDY_CHANNEL: "beta" })).toBe("beta-v0.1.0")
  expect(changelogSourceRef("0.1.0", "deadbeef", { BUDDY_CHANNEL: "beta" })).toBe("deadbeef")
  expect(changelogSourceRef("beta-v0.1.0", undefined, { BUDDY_CHANNEL: "beta" })).toBe(
    "beta-v0.1.0",
  )
  expect(() => changelogSourceRef("v0.1.0", undefined, { BUDDY_CHANNEL: "beta" })).toThrow(
    "does not belong",
  )
})

describe("paginated mixed repository baselines", () => {
  test.each(["prod", "beta"] as const)(
    "%s derives changelog and next versions only from its stream",
    async (channel) => {
      const { chmod, mkdir, mkdtemp, rm } = await import("node:fs/promises")
      const { spawnSync } = await import("node:child_process")
      const path = await import("node:path")
      const os = await import("node:os")
      const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-changelog-pages-"))
      const root = path.resolve(import.meta.dir, "..")
      try {
        const bin = path.join(directory, "bin")
        await mkdir(bin)
        const pages = [
          [
            ...Array.from({ length: 100 }, () => release("skill-artifacts")),
            release("v99.0.0", false, true),
            release("beta-v99.0.0", true, true),
            release("beta-v98.0.0", false),
            release("beta-v9.0.0-rc.1"),
            release("v9.0.0-rc.1"),
          ],
          [release("v0.1.0", false), release("beta-v0.1.0")],
          [release("v0.1.2"), release("beta-v0.1.1")],
        ]
        const gh = path.join(bin, "gh")
        await Bun.write(
          gh,
          `#!${process.execPath}\nconst args = process.argv.slice(2); if (args[0] !== "api" || !args.includes("--paginate") || !args.includes("--slurp")) throw new Error("Expected full pagination"); console.log(${JSON.stringify(JSON.stringify(pages))});\n`,
        )
        await chmod(gh, 0o755)
        const environment = {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          BUDDY_CHANNEL: channel,
          BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
          GH_REPO: "",
          BUDDY_VERSION: "",
          BUDDY_TAG: "",
          BUDDY_BUMP: "patch",
          GITHUB_REF_TYPE: "branch",
        }
        const result = spawnSync(
          process.execPath,
          [
            "--eval",
            `
        import { getLatestRelease, getLatestPublishedRelease } from ${JSON.stringify(path.join(root, "script/changelog.ts"))};
        import { Script } from ${JSON.stringify(path.join(root, "packages/script/src/index.ts"))};
        import { highestPublishedBetaVersion } from ${JSON.stringify(path.join(root, "script/release/beta-publication.ts"))};
        console.log(JSON.stringify({ baseline: await getLatestRelease(), highest: await getLatestPublishedRelease(), skip: await getLatestRelease("0.1.1"), version: Script.version, beta: await highestPublishedBetaVersion("prashantbhudwal/buddy-releases") }));
      `,
          ],
          { cwd: root, env: environment, encoding: "utf8" },
        )
        expect(result.stderr).toBe("")
        expect(result.status).toBe(0)
        expect(JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "")).toEqual(
          channel === "prod"
            ? {
                baseline: "0.1.0",
                highest: "0.1.2",
                skip: "0.1.0",
                version: "0.1.3",
                beta: "0.1.1",
              }
            : {
                baseline: "0.1.1",
                highest: "0.1.1",
                skip: "0.1.0",
                version: "0.1.2",
                beta: "0.1.1",
              },
        )
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )
})
