import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const INSTALLER = path.resolve(import.meta.dir, "install-release.sh")
const macTest = process.platform === "darwin" ? test : test.skip
const release = (tag_name: string, prerelease: boolean, draft = false) => ({
  tag_name,
  prerelease,
  draft,
})
const mixedPages = [
  [
    release("v9.0.0", false),
    release("v0.9.0", true),
    release("beta-v0.9.0", true),
    release("beta-v99.0.0", false),
    release("beta-v98.0.0", true, true),
    release("beta-v1.0", true),
    ...Array.from({ length: 94 }, () => release("skill-artifacts", true)),
  ],
  [release("beta-v0.10.0", true), release("v0.10.0", true)],
]

async function installFixture(
  bundleId: string,
  args: string[] = ["--channel", "beta", "beta-v0.1.0"],
  overrides: NodeJS.ProcessEnv = {},
  pages = mixedPages,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "buddy-beta-installer-test-"))
  try {
    const bin = path.join(root, "bin")
    const destination = path.join(root, "Applications")
    const appName = args.includes("beta") ? "Buddy Beta" : "Buddy"
    const installed = path.join(destination, `${appName}.app`)
    await mkdir(bin)
    await mkdir(installed, { recursive: true })
    await Bun.write(path.join(installed, "keep.txt"), "existing app")
    await Bun.write(path.join(root, "releases.json"), JSON.stringify(pages))
    const programs = {
      uname: "#!/bin/bash\necho arm64\n",
      gh: `#!/bin/bash
printf '%s\\n' "$*" >> "$FIXTURE_LOG"
if [[ "$1" == "api" ]]; then
  if [[ "$2" == */releases/latest ]]; then printf '%s\\n' "$FIXTURE_LATEST"; exit; fi
  [[ "$*" == *--paginate* && "$*" == *per_page=100* ]] || exit 2
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--jq" ]]; then jq -r ".[] | ($2)" "$FIXTURE_RELEASES"; exit; fi
    shift
  done
  exit 2
elif [[ "$1 $2" == "release view" ]]; then
  printf '%s\\t%s\\n' "$FIXTURE_DRAFT" "$FIXTURE_PRERELEASE"
else
  while [[ $# -gt 0 ]]; do
    case "$1" in --dir) dir="$2"; shift 2;; --pattern) asset="$2"; shift 2;; *) shift;; esac
  done
  if [[ -n "$FIXTURE_MANIFEST" ]]; then
    [[ "$asset" == latest-*.json || "$asset" == *.zip ]] || exit 1
    if [[ "$asset" == *.json ]]; then printf '{"url":"%s"}' "$FIXTURE_MANIFEST" > "$dir/$asset"; exit; fi
  fi
  touch "$dir/$asset"
fi
`,
      curl: '#!/bin/bash\nprintf "curl %s\\n" "$*" >> "$FIXTURE_LOG"\nwhile [[ $# -gt 0 ]]; do if [[ "$1" == "-o" ]]; then touch "$2"; exit; fi; shift; done\n',
      hdiutil:
        '#!/bin/bash\nif [[ "$1" == "attach" ]]; then while [[ $# -gt 0 ]]; do if [[ "$1" == "-mountpoint" ]]; then mkdir -p "$2/$FIXTURE_APP_NAME.app/Contents"; touch "$2/$FIXTURE_APP_NAME.app/Contents/Info.plist"; break; fi; shift; done; fi\n',
      plutil: '#!/bin/bash\necho "$FIXTURE_BUNDLE_ID"\n',
      ditto:
        '#!/bin/bash\nif [[ "$1" == "-x" ]]; then mkdir -p "$4/$FIXTURE_APP_NAME.app/Contents"; else cp -R "$1" "$2"; fi\n',
      xattr: "#!/bin/bash\nexit 0\n",
      defaults: "#!/bin/bash\necho 0.1.0\n",
      mount: "#!/bin/bash\nexit 0\n",
    }
    for (const [name, source] of Object.entries(programs)) {
      const file = path.join(bin, name)
      await Bun.write(file, source)
      await chmod(file, 0o755)
    }
    const log = path.join(root, "commands.txt")
    const result = spawnSync("bash", [INSTALLER, ...args], {
      env: {
        ...process.env,
        BUDDY_RELEASE_REPO: "",
        GH_REPO: "",
        BUDDY_APP_NAME: "",
        BUDDY_INSTALL_RELEASE_KIND: "stable",
        FIXTURE_MANIFEST: "",
        FIXTURE_DRAFT: "false",
        FIXTURE_LATEST: "v9.0.0",
        FIXTURE_PRERELEASE:
          appName === "Buddy Beta" || overrides.BUDDY_INSTALL_RELEASE_KIND === "preview"
            ? "true"
            : "false",
        ...overrides,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: root,
        TMPDIR: root,
        BUDDY_INSTALL_DIR: destination,
        FIXTURE_BUNDLE_ID: bundleId,
        FIXTURE_LOG: log,
        FIXTURE_RELEASES: path.join(root, "releases.json"),
        FIXTURE_APP_NAME: appName,
      },
      encoding: "utf8",
    })
    return {
      result,
      preserved: await Bun.file(path.join(installed, "keep.txt")).exists(),
      commands: (await Bun.file(log).exists()) ? await Bun.file(log).text() : "",
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("local release installer stream boundary", () => {
  macTest("installs Beta from the shared repo with numeric asset filenames", async () => {
    const { result, preserved, commands } = await installFixture("ai.buddy.desktop.beta")
    expect(result.status).toBe(0)
    expect(commands).toContain("--repo prashantbhudwal/buddy-releases")
    expect(commands).toContain("release download beta-v0.1.0")
    expect(commands).toContain("buddy-v0.1.0-macos-apple-silicon.dmg")
    expect(result.stdout).toContain("Installed Buddy Beta")
    expect(preserved).toBe(false)
  })

  macTest("discovers highest Beta across pages while excluding other releases", async () => {
    const { result, commands } = await installFixture("ai.buddy.desktop.beta", [
      "--channel",
      "beta",
    ])
    expect(result.status).toBe(0)
    expect(commands).toContain("release view beta-v0.10.0")
    expect(commands).toContain("--pattern buddy-v0.10.0-macos-apple-silicon.dmg")
    expect(commands).not.toContain("releases/latest")
  })

  macTest("Preview discovers only prod tags across pages", async () => {
    const pages = mixedPages.map((page) =>
      page.map((item) => (item.tag_name === "v0.9.0" ? { ...item, prerelease: false } : item)),
    )
    const { result, commands } = await installFixture(
      "ai.buddy.desktop",
      [],
      { BUDDY_INSTALL_RELEASE_KIND: "preview" },
      pages,
    )
    expect(result.status).toBe(0)
    expect(commands).toContain("release view v0.10.0")
    expect(commands).not.toContain("release view beta-v")
  })

  macTest("Stable discovery ignores Beta and Preview", async () => {
    const { result, commands } = await installFixture("ai.buddy.desktop", [])
    expect(result.status).toBe(0)
    expect(commands).toContain("release view v9.0.0")
  })

  macTest(
    "Stable preserves a valid GitHub latest tag even below another published version",
    async () => {
      const fixture = await installFixture("ai.buddy.desktop", [], { FIXTURE_LATEST: "v0.1.0" })
      expect(fixture.result.status).toBe(0)
      expect(fixture.commands).toContain("release view v0.1.0")
      expect(fixture.commands).not.toContain("--paginate")
    },
  )

  macTest("Stable falls back to paginated prod discovery when latest belongs to Beta", async () => {
    const fixture = await installFixture("ai.buddy.desktop", [], { FIXTURE_LATEST: "beta-v0.1.0" })
    expect(fixture.result.status).toBe(0)
    expect(fixture.commands).toContain("--paginate")
    expect(fixture.commands).toContain("release view v9.0.0")
    expect(fixture.commands).not.toContain("release view beta-v")
  })

  macTest("Preview preserves API order among published prod prereleases", async () => {
    const fixture = await installFixture("ai.buddy.desktop", [], {
      BUDDY_INSTALL_RELEASE_KIND: "preview",
    })
    expect(fixture.result.status).toBe(0)
    expect(fixture.commands).toContain("release view v0.9.0")
    expect(fixture.commands).not.toContain("release view beta-v")
  })

  macTest("fails before downloading or replacing when no Beta exists", async () => {
    const fixture = await installFixture("ai.buddy.desktop.beta", ["--channel", "beta"], {}, [
      [release("v1.0.0", true), release("beta-v0.1.0", false)],
    ])
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toContain("Could not resolve")
    expect(fixture.commands).not.toContain("release download")
    expect(fixture.preserved).toBe(true)
  })

  macTest("checks bundle identity before deleting the existing app", async () => {
    const { result, preserved } = await installFixture("ai.buddy.desktop")
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("refusing replacement")
    expect(preserved).toBe(true)
  })

  macTest("rejects repo overrides pointing away from the shared repo", async () => {
    const { result, preserved, commands } = await installFixture(
      "ai.buddy.desktop.beta",
      undefined,
      { BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-beta-releases" },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("must match beta")
    expect(commands).toBe("")
    expect(preserved).toBe(true)
  })

  macTest.each([
    ["prod", "beta-v0.1.0"],
    ["beta", "v0.1.0"],
    ["prod", "skill-artifacts"],
    ["beta", "beta-v1.0"],
  ])("rejects an explicit tag outside %s: %s", async (channel, tag) => {
    const fixture = await installFixture(
      channel === "beta" ? "ai.buddy.desktop.beta" : "ai.buddy.desktop",
      ["--channel", channel, "--tag", tag],
    )
    expect(fixture.result.status).toBe(1)
    expect(fixture.result.stderr).toContain("does not belong")
    expect(fixture.commands).toBe("")
    expect(fixture.preserved).toBe(true)
  })

  macTest.each([{ FIXTURE_PRERELEASE: "false" }, { FIXTURE_DRAFT: "true" }])(
    "rejects unpublished explicit Beta releases: %j",
    async (overrides) => {
      const fixture = await installFixture("ai.buddy.desktop.beta", undefined, overrides)
      expect(fixture.result.status).toBe(1)
      expect(fixture.commands).not.toContain("release download")
      expect(fixture.preserved).toBe(true)
    },
  )

  macTest.each([
    "archive.zip",
    "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v0.0.9/archive.zip",
  ])("allows pinned Beta fallback %s", async (url) => {
    const fixture = await installFixture("ai.buddy.desktop.beta", undefined, {
      FIXTURE_MANIFEST: url,
    })
    expect(fixture.result.status).toBe(0)
    expect(fixture.commands).toContain(
      "release download beta-v0.1.0 --repo prashantbhudwal/buddy-releases --pattern latest-macos-arm64.json",
    )
    if (url.startsWith("https:"))
      expect(fixture.commands).toContain(`curl -fL --show-error --silent ${url}`)
    else
      expect(fixture.commands).toContain(
        "release download beta-v0.1.0 --repo prashantbhudwal/buddy-releases --pattern archive.zip",
      )
  })

  macTest("rejects a Stable fallback URL before archive download or replacement", async () => {
    const fixture = await installFixture("ai.buddy.desktop.beta", undefined, {
      FIXTURE_MANIFEST:
        "https://github.com/prashantbhudwal/buddy-releases/releases/download/v0.1.0/archive.zip",
    })
    expect(fixture.result.status).toBe(1)
    expect(fixture.commands).not.toContain("curl ")
    expect(fixture.preserved).toBe(true)
  })

  macTest("keeps prod and Preview explicit installations on the original app", async () => {
    const prod = await installFixture("ai.buddy.desktop", ["v0.1.0"])
    expect(prod.result.status).toBe(0)
    expect(prod.commands).toContain("--repo prashantbhudwal/buddy-releases")
    expect(prod.result.stdout).toContain("Installed Buddy")
    const preview = await installFixture("ai.buddy.desktop", ["v0.1.0"], {
      BUDDY_INSTALL_RELEASE_KIND: "preview",
    })
    expect(preview.result.status).toBe(0)
  })

  macTest("rejects Beta preview and unsupported channel flags", async () => {
    const preview = await installFixture("ai.buddy.desktop.beta", undefined, {
      BUDDY_INSTALL_RELEASE_KIND: "preview",
    })
    expect(preview.result.status).toBe(1)
    expect(preview.result.stderr).toContain("Preview is only available for prod")
    const invalid = await installFixture("ai.buddy.desktop.beta", ["--channel", "dev"])
    expect(invalid.result.status).toBe(1)
    expect(invalid.commands).toBe("")
  })
})
