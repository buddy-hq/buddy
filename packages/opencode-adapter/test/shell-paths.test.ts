import { expect, test } from "bun:test"
import path from "node:path"
import { scanShellExternalDirectories } from "../src/extension/shell-paths"

const windows = {
  platform: "win32",
  path: path.win32,
  home: "C:\\Users\\learner",
  env: { UserProfile: "C:\\Users\\learner" },
  isDirectory: (file: string) => ["C:\\outside", "C:\\Users\\learner\\x"].includes(file),
}
const winLocation = { directory: "C:\\notebook", project: { directory: "C:\\" } }

test.each([
  [String.raw`New-Item -Path C:\outside\x.txt`, ["C:\\outside"]],
  [String.raw`Set-Content C:\outside\a.txt hi`, ["C:\\outside"]],
  ["Copy-Item a.txt -Destination C:\\outside\\", ["C:\\outside"]],
  ["copy a.txt C:\\outside\\", ["C:\\outside"]],
  [String.raw`del /q C:\outside\a.txt`, ["C:\\outside"]],
  ["COPY a.txt C:\\outside\\", ["C:\\outside"]],
  ["rm /c/outside/a", ["C:\\outside"]],
  [String.raw`New-Item -LiteralPath 'C:\outside space\x.txt'`, ["C:\\outside space"]],
  [String.raw`Set-Content "$env:USERPROFILE\x" hi`, ["C:\\Users\\learner\\x"]],
  [String.raw`New-Item -Path FileSystem::C:\outside\x`, ["C:\\outside"]],
  [String.raw`Get-Content HKLM:\SOFTWARE\Buddy`, []],
  [String.raw`Remove-Item $var\x`, []],
  [String.raw`Remove-Item $PSHOME\x`, []],
  ["chmod +x a.sh", []],
  [String.raw`Remove-Item C:\outside\*.txt`, ["C:\\outside"]],
  [String.raw`New-Item -Path C:\notebook\x.txt`, []],
  [String.raw`cd C:\outside`, []],
  [String.raw`Set-Location -Path C:\outside`, []],
  [String.raw`rm C:\outside\a 'unterminated`, ["C:\\outside"]],
  [
    String.raw`New-Item -Force -Path C:\outside\x.txt; del C:\other\a`,
    ["C:\\outside", "C:\\other"],
  ],
])("Windows file arguments: %s", async (command, expected) => {
  expect(await scanShellExternalDirectories({ command, location: winLocation }, windows)).toEqual(
    expected,
  )
})

const posix = {
  platform: "darwin",
  path: path.posix,
  home: "/home/learner",
  env: {},
  isDirectory: (file: string) => ["/home/learner/x", "/tmp/existing"].includes(file),
}
const location = { directory: "/workspace/notebook", project: { directory: "/" } }

test.each([
  ["rm /tmp/x/a", ["/tmp/x"]],
  ["mkdir ../outside", ["/workspace"]],
  ["cp a.txt ~/x/", ["/home/learner/x"]],
  ["rm '/tmp/space dir/a'", ["/tmp/space dir"]],
  ["rm /tmp/existing", ["/tmp/existing"]],
  ["rm /workspace/notebook/a", []],
  ["rm /workspace/notebook-other/a", ["/workspace/notebook-other"]],
  ["rm $var/x", []],
  ["cd /tmp/x", []],
  ["echo x > /tmp/x/a", []],
  ["python /tmp/write.py", []],
  ["/tmp/write.sh", []],
  ["Set-Content -Path /tmp/x/a hi", ["/tmp/x"]],
  ["rm /tmp/x/a /tmp/x/b", ["/tmp/x"]],
])("POSIX file arguments: %s", async (command, expected) => {
  expect(await scanShellExternalDirectories({ command, location }, posix)).toEqual(expected)
})

test("relative workdir and project containment use the v2 boundary", async () => {
  expect(
    await scanShellExternalDirectories(
      {
        command: "rm a.txt",
        workdir: "../outside",
        location,
      },
      posix,
    ),
  ).toEqual(["/workspace/outside"])
  expect(
    await scanShellExternalDirectories(
      {
        command: "rm ../sibling/a.txt",
        location: { ...location, project: { directory: "/workspace" } },
      },
      posix,
    ),
  ).toEqual([])
  expect(
    await scanShellExternalDirectories(
      {
        command: String.raw`del ..\sibling\a.txt`,
        location: { directory: "C:\\project\\notebook", project: { directory: "C:\\project" } },
      },
      windows,
    ),
  ).toEqual([])
})
