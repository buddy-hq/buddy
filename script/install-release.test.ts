import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const INSTALLER = path.resolve(import.meta.dir, "install-release.sh")

async function installFixture(
  bundleId: string,
  args: string[] = ["--channel", "beta", "v0.1.0"],
  overrides: NodeJS.ProcessEnv = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "buddy-beta-installer-test-"))
  try {
    const bin = path.join(root, "bin")
    const destination = path.join(root, "Applications")
    const appName = args.includes("beta") ? "Buddy Beta" : "Buddy"
    const installed = path.join(destination, `${appName}.app`)
    await mkdir(bin)
    await mkdir(installed, { recursive: true })
    await Bun.write(path.join(installed, "keep.txt"), "existing Beta")
    const programs = {
      uname: "#!/bin/bash\necho arm64\n",
      gh: '#!/bin/bash\nprintf "%s\\n" "$*" >> "$FIXTURE_LOG"\nif [[ "$1 $2" == "release view" ]]; then printf "false\\t%s\\n" "$FIXTURE_PRERELEASE"; else while [[ $# -gt 0 ]]; do case "$1" in --dir) dir="$2"; shift 2;; --pattern) asset="$2"; shift 2;; *) shift;; esac; done; touch "$dir/$asset"; fi\n',
      hdiutil:
        '#!/bin/bash\nif [[ "$1" == "attach" ]]; then while [[ $# -gt 0 ]]; do if [[ "$1" == "-mountpoint" ]]; then mkdir -p "$2/$FIXTURE_APP_NAME.app/Contents"; touch "$2/$FIXTURE_APP_NAME.app/Contents/Info.plist"; break; fi; shift; done; fi\n',
      plutil: '#!/bin/bash\necho "$FIXTURE_BUNDLE_ID"\n',
      ditto: '#!/bin/bash\ncp -R "$1" "$2"\n',
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
        ...overrides,
        PATH: `${bin}:${process.env.PATH}`,
        BUDDY_INSTALL_DIR: destination,
        FIXTURE_BUNDLE_ID: bundleId,
        FIXTURE_LOG: log,
        FIXTURE_APP_NAME: appName,
        FIXTURE_PRERELEASE: overrides.BUDDY_INSTALL_RELEASE_KIND === "preview" ? "true" : "false",
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

describe("Beta installer boundary", () => {
  test("resolves the Beta repo and app name together and installs the matching bundle", async () => {
    const { result, preserved, commands } = await installFixture("ai.buddy.desktop.beta")
    expect(result.status).toBe(0)
    expect(commands).toContain("--repo prashantbhudwal/buddy-beta-releases")
    expect(result.stdout).toContain("Installed Buddy Beta")
    expect(preserved).toBe(false)
  })

  test("checks bundle identity before deleting the existing app", async () => {
    const { result, preserved } = await installFixture("ai.buddy.desktop")
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("refusing replacement")
    expect(preserved).toBe(true)
  })

  test("rejects conflicting repo overrides before downloads or replacement", async () => {
    const { result, preserved, commands } = await installFixture(
      "ai.buddy.desktop.beta",
      undefined,
      { BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases" },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("must match beta")
    expect(commands).toBe("")
    expect(preserved).toBe(true)
  })

  test("keeps prod and Preview installations on the original repo and app name", async () => {
    const prod = await installFixture("ai.buddy.desktop", ["v0.1.0"])
    expect(prod.result.status).toBe(0)
    expect(prod.commands).toContain("--repo prashantbhudwal/buddy-releases")
    expect(prod.result.stdout).toContain("Installed Buddy")
    const preview = await installFixture("ai.buddy.desktop", ["v0.1.0"], {
      BUDDY_INSTALL_RELEASE_KIND: "preview",
    })
    expect(preview.result.status).toBe(0)
    expect(preview.commands).toContain("--repo prashantbhudwal/buddy-releases")
  })

  test("rejects Beta preview and unsupported channel flags", async () => {
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
