import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"

const scripts = path.resolve(import.meta.dir, "../scripts")

async function maintenanceFixture(
  command: "cleanup" | "count",
  args: string[],
  pages: unknown[][],
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "buddy-release-maintenance-"))
  try {
    const bin = path.join(root, "bin")
    await mkdir(bin)
    await Bun.write(path.join(root, "pages.json"), JSON.stringify(pages))
    const gh = path.join(bin, "gh")
    await Bun.write(
      gh,
      `#!/bin/bash
printf '%s\\n' "$*" >> "$FIXTURE_LOG"
if [[ "$1" == "auth" ]]; then exit 0; fi
if [[ "$1" == "api" ]]; then
  [[ "$*" == *--paginate* && "$*" == *per_page=100* ]] || exit 2
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--jq" ]]; then jq -r ".[] | ($2)" "$FIXTURE_RELEASES"; exit; fi
    shift
  done
  cat "$FIXTURE_RELEASES"
elif [[ "$1 $2" == "release view" ]]; then
  printf 'buddy-electron-mac-arm64.dmg\\nbuddy-electron-mac-x64.dmg\\n'
else exit 2
fi
`,
    )
    await chmod(gh, 0o755)
    const log = path.join(root, "commands.txt")
    const result = spawnSync(
      "bash",
      command === "count"
        ? [path.join(scripts, "release-download-count.sh"), ...args]
        : [
            "-c",
            'source "$1"; resolve_architecture; resolve_release_tag "$2" "$3"',
            "fixture",
            path.join(scripts, "cleanup-buddy-macos.sh"),
            ...args,
          ],
      {
        env: {
          ...process.env,
          HOME: root,
          TMPDIR: root,
          PATH: `${bin}:${process.env.PATH}`,
          BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
          BUDDY_INSTALL_DIR: path.join(root, "Applications"),
          FIXTURE_RELEASES: path.join(root, "pages.json"),
          FIXTURE_LOG: log,
        },
        encoding: "utf8",
      },
    )
    return { result, commands: (await Bun.file(log).exists()) ? await Bun.file(log).text() : "" }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const release = (
  tag_name: string,
  prerelease = false,
  draft = false,
  published_at = "2026-01-01T00:00:00Z",
) => ({
  tag_name,
  prerelease,
  draft,
  published_at,
  assets: [
    { name: "buddy-v0.1.0-macos-apple-silicon.dmg", download_count: 4 },
    { name: "latest-macos-arm64.json", download_count: 3 },
  ],
})

describe("production release maintenance", () => {
  test.each(["preview", "stable"])(
    "cleanup paginates and considers only prod %s tags",
    async (kind) => {
      const prerelease = kind === "preview"
      const fixture = await maintenanceFixture(
        "cleanup",
        [kind, ""],
        [
          Array.from({ length: 100 }, () => release("beta-v9.0.0", true)),
          [
            release("beta-v0.10.0", true),
            release("skill-artifacts", prerelease),
            release("v1.0", prerelease),
            release("v0.10.0", prerelease),
          ],
        ],
      )
      expect(fixture.result.status).toBe(0)
      expect(fixture.result.stdout.trim()).toBe("v0.10.0")
      expect(fixture.commands).toContain("--paginate")
      expect(fixture.commands).toContain("release view v0.10.0")
      expect(fixture.commands).not.toContain("release view beta-v")
      expect(fixture.commands).not.toContain("release view skill-artifacts")
    },
  )

  test.each(["beta-v0.1.0", "skill-artifacts", "v0.1"])(
    "cleanup rejects explicit non-prod tag %s before staging",
    async (tag) => {
      const fixture = await maintenanceFixture("cleanup", ["preview", tag], [[]])
      expect(fixture.result.status).toBe(1)
      expect(fixture.result.stderr).toContain("Production cleanup requires a vX.Y.Z")
      expect(fixture.commands).toBe("")
    },
  )

  test("download counts filter streams before sorting and taking the last three", async () => {
    const fixture = await maintenanceFixture(
      "count",
      [],
      [
        [
          release("beta-v99.0.0", true, false, "2026-10-01T00:00:00Z"),
          release("v99.0.0", false, true, "2026-09-01T00:00:00Z"),
          release("skill-artifacts", false, false, "2026-08-01T00:00:00Z"),
          release("v9.0", false, false, "2026-07-01T00:00:00Z"),
          release("v0.1.0", false, false, "2026-01-01T00:00:00Z"),
          ...Array.from({ length: 95 }, () => release("beta-v0.1.0", false)),
        ],
        [
          release("v0.2.0", true, false, "2026-03-01T00:00:00Z"),
          release("v0.3.0", false, false, "2026-04-01T00:00:00Z"),
          release("v0.0.9", false, false, "2025-12-01T00:00:00Z"),
        ],
      ],
    )
    expect(fixture.result.status).toBe(0)
    expect(fixture.result.stdout).toContain("v0.2.0 — published 2026-03-01T00:00:00Z (prerelease)")
    expect(fixture.result.stdout).toContain("v0.3.0 — published")
    expect(fixture.result.stdout).toContain("v0.1.0 — published")
    expect(fixture.result.stdout).not.toContain("v0.0.9 —")
    expect(fixture.result.stdout).not.toContain("beta-v")
    expect(fixture.result.stdout).not.toContain("skill-artifacts")
    expect(fixture.result.stdout).not.toContain("latest-macos-arm64.json")
    expect(fixture.result.stdout).toContain("Combined total: 12")
  })

  test("download count all-assets retains prod reporting semantics", async () => {
    const fixture = await maintenanceFixture(
      "count",
      ["--all-assets"],
      [[release("v0.1.0"), release("beta-v0.1.0", true)]],
    )
    expect(fixture.result.status).toBe(0)
    expect(fixture.result.stdout).toContain("Scope: all release assets")
    expect(fixture.result.stdout).toContain("latest-macos-arm64.json: 3")
    expect(fixture.result.stdout).toContain("Combined total: 7")
    expect(fixture.result.stdout).not.toContain("beta-v")
  })
})
