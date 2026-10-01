import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { discoverFileApplications } from "../src/main/file-applications"

describe("native file applications", () => {
  const temporaryRoots: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    )
  })

  async function createRoot() {
    const root = await mkdtemp(join(tmpdir(), "buddy-file-applications-"))
    temporaryRoots.push(root)
    return root
  }

  test("offers only installed macOS apps, using the first installation root", async () => {
    const first = await createRoot()
    const second = await createRoot()
    await mkdir(join(first, "Cursor.app"))
    await mkdir(join(second, "Cursor.app"))
    await mkdir(join(second, "Zed.app"))
    await writeFile(join(first, "Visual Studio Code.app"), "not an application bundle")

    expect(await discoverFileApplications({ platform: "darwin", roots: [first, second] })).toEqual([
      { id: "cursor", name: "Cursor", path: join(first, "Cursor.app") },
      { id: "zed", name: "Zed", path: join(second, "Zed.app") },
    ])
  })

  test("discovers Windows executable installations and system Notepad", async () => {
    const root = await createRoot()
    const systemRoot = await createRoot()
    await mkdir(join(root, "Microsoft VS Code"))
    await writeFile(join(root, "Microsoft VS Code", "Code.exe"), "fixture")
    await mkdir(join(root, "Cursor", "Cursor.exe"), { recursive: true })
    await mkdir(join(systemRoot, "System32"))
    await writeFile(join(systemRoot, "System32", "notepad.exe"), "fixture")

    expect(
      await discoverFileApplications({ platform: "win32", roots: [root], systemRoot }),
    ).toEqual([
      {
        id: "vscode",
        name: "Visual Studio Code",
        path: join(root, "Microsoft VS Code", "Code.exe"),
      },
      { id: "notepad", name: "Notepad", path: join(systemRoot, "System32", "notepad.exe") },
    ])
  })

  test("returns no choices when configured installation roots are unavailable", async () => {
    const root = await createRoot()
    expect(
      await discoverFileApplications({ platform: "darwin", roots: [join(root, "missing")] }),
    ).toEqual([])
  })
})
