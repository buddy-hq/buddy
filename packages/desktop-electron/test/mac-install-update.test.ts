import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const INSTALLER_PATH = resolve(import.meta.dir, "../resources/mac-install-update.sh")
const MOCK_COMMANDS = `
function /usr/bin/ditto() {
  if [[ "$1" == "-x" ]]; then /bin/cp -R "$FIXTURE_SOURCE/." "$4/";
  else /bin/cp -R "$1" "$2"; fi
}
function /usr/bin/codesign() { return 0; }
function /usr/sbin/spctl() { return 0; }
function /usr/bin/xattr() { return 0; }
function open() { return 0; }
function kill() { return 1; }
source "$@"
`

async function bundle(path: string, id: string | undefined, marker: string): Promise<void> {
  await mkdir(join(path, "Contents"), { recursive: true })
  await writeFile(join(path, "Contents/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict>${id ? `<key>CFBundleIdentifier</key><string>${id}</string>` : ""}</dict></plist>`)
  await writeFile(join(path, "marker"), marker)
}

async function withInstaller(input: {
  installedId?: string
  sourceId?: string
  expectedId?: string
  multiple?: boolean
}, run: (result: { exitCode: number; target: string; log: string; result: string }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "buddy-beta-installer-test-"))
  try {
    const source = join(root, "source")
    const target = join(root, "Installed.app")
    await bundle(target, input.installedId, "installed")
    await bundle(join(source, "Update.app"), input.sourceId, "update")
    if (input.multiple) await bundle(join(source, "Other.app"), input.sourceId, "other")
    const log = join(root, "installer.log")
    const result = join(root, "result.json")
    const args = [INSTALLER_PATH, "unused-mocked-pid", "unused-mocked-archive", target, "Buddy", log, result]
    if (input.expectedId !== undefined) args.push(input.expectedId)
    const child = Bun.spawn(["/bin/bash", "-c", MOCK_COMMANDS, "installer-test", ...args], {
      env: { ...process.env, TMPDIR: root, FIXTURE_SOURCE: source },
      stdout: "pipe", stderr: "pipe",
    })
    const exitCode = await child.exited
    await run({ exitCode, target, log, result })
  } finally { await rm(root, { recursive: true, force: true }) }
}

// PlistBuddy is a macOS system tool; all signature, copy and relaunch commands are mocked.
describe.skipIf(process.platform !== "darwin")("macOS installer app identity", () => {
  test.each([
    ["ai.buddy.desktop", "ai.buddy.desktop.beta"],
    ["ai.buddy.desktop.beta", "ai.buddy.desktop"],
  ])("rejects replacing %s with %s before removal", async (installedId, sourceId) => {
    await withInstaller({ installedId, sourceId, expectedId: installedId }, async ({ exitCode, target, log, result }) => {
      expect(exitCode).toBe(1)
      expect(await readFile(join(target, "marker"), "utf8")).toBe("installed")
      expect(await readFile(log, "utf8")).toContain("app bundle identity mismatch")
      expect(JSON.parse(await readFile(result, "utf8"))).toEqual({ status: "failed", exitCode: 1 })
    })
  })

  test.each(["ai.buddy.desktop", "ai.buddy.desktop.beta"])("accepts matching %s identities on the no-TeamIdentifier path", async (id) => {
    await withInstaller({ installedId: id, sourceId: id, expectedId: id }, async ({ exitCode, target, result }) => {
      expect(exitCode).toBe(0)
      expect(await readFile(join(target, "marker"), "utf8")).toBe("update")
      expect(JSON.parse(await readFile(result, "utf8"))).toEqual({ status: "succeeded", exitCode: 0 })
    })
  })

  test.each([
    { installedId: undefined, sourceId: "ai.buddy.desktop.beta" },
    { installedId: "ai.buddy.desktop.beta", sourceId: undefined },
    { installedId: "ai.buddy.desktop", sourceId: "ai.buddy.desktop.beta" },
    { installedId: "ai.buddy.desktop.beta", sourceId: "ai.buddy.desktop.beta", multiple: true },
  ])("rejects missing or inconsistent identities and ambiguous archives", async (input) => {
    await withInstaller({ ...input, expectedId: "ai.buddy.desktop.beta" }, async ({ exitCode, target }) => {
      expect(exitCode).toBe(1)
      expect(await readFile(join(target, "marker"), "utf8")).toBe("installed")
    })
  })

  test("requires an expected bundle identifier argument", async () => {
    await withInstaller({ installedId: "ai.buddy.desktop", sourceId: "ai.buddy.desktop" }, async ({ exitCode, target }) => {
      expect(exitCode).not.toBe(0)
      expect(await readFile(join(target, "marker"), "utf8")).toBe("installed")
    })
  })
})
