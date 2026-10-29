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
  [String.raw`Remove-Item -Path C:\notebook\a,C:\outside\b`, ["C:\\outside"]],
  [String.raw`Remove-Item -LiteralPath C:\notebook\a, D:\outside\b`, ["D:\\outside"]],
  [
    String.raw`Copy-Item -Path C:\notebook\a,C:\outside\b -Destination C:\notebook`,
    ["C:\\outside"],
  ],
  [String.raw`rm C:\notebook\a,C:\outside\b`, ["C:\\outside"]],
  [String.raw`rm -LiteralPath @('C:\notebook\a','C:\outside\b')`, ["C:\\outside"]],
  [String.raw`Remove-Item @('C:\notebook\a'; 'C:\outside\b')`, ["C:\\outside"]],
  [
    String.raw`Remove-Item 'C:\notebook\a', 'C:\outside\b', 'D:\other\c'`,
    ["C:\\outside", "D:\\other"],
  ],
  [String.raw`Remove-Item 'C:\notebook\a,b'`, []],
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
  ["Set-Content -Path /tmp/x/a hi", []],
  ["cat <<EOF\nrm /tmp/out/a\nEOF", []],
  ["cat -Value /tmp/out/a", ["/tmp/out"]],
  ["rm /tmp/x/a /tmp/x/b", ["/tmp/x"]],
])("POSIX file arguments: %s", async (command, expected) => {
  expect(await scanShellExternalDirectories({ command, location }, posix)).toEqual(expected)
})

test.each([
  "-Value",
  "-ItemType",
  "-Encoding",
  "-Filter",
  "-Include",
  "-Exclude",
  "-Stream",
  "-Delimiter",
  "-NewName",
  "-Credential",
])(
  "PowerShell %s values are data while path parameters still need approval",
  async (parameter) => {
    for (const command of ["Set-Content", "set-content", "New-Item", "rm"]) {
      expect(
        await scanShellExternalDirectories(
          {
            command: `${command} -Path local.txt ${parameter} 'C:\\outside\\data'`,
            location: winLocation,
          },
          windows,
        ),
      ).toEqual([])
      expect(
        await scanShellExternalDirectories(
          {
            command: `${command} ${parameter}:'C:\\payload\\data' -Path C:\\outside\\a`,
            location: winLocation,
          },
          windows,
        ),
      ).toEqual(["C:\\outside"])
    }
  },
)

test("unknown PowerShell parameters still treat their value as a possible path", async () => {
  expect(
    await scanShellExternalDirectories(
      {
        command: String.raw`Remove-Item -Unrecognized C:\outside\a`,
        location: winLocation,
      },
      windows,
    ),
  ).toEqual(["C:\\outside"])
})

test.each([
  String.raw`Set-Content -Path local.txt -Value C:\notebook\a,C:\outside\b`,
  String.raw`set-content -Path local.txt -Value @('C:\notebook\a','C:\outside\b')`,
  String.raw`rm -Path local.txt -Exclude C:\notebook\a, C:\outside\b`,
  String.raw`rm -Path local.txt -Exclude: C:\outside\b`,
  String.raw`rm -Path local.txt -Exclude:C:\notebook\a, C:\outside\b`,
])("PowerShell array-valued non-path parameters stay data: %s", async (command) => {
  expect(await scanShellExternalDirectories({ command, location: winLocation }, windows)).toEqual([])
})

test.each(["/usr/local/bin/pwsh", "/opt/powershell", "/usr/local/bin/PWSH"])(
  "PowerShell grammar is enabled by SHELL=%s on POSIX",
  async (shell) => {
    expect(
      await scanShellExternalDirectories(
        {
          command: "Remove-Item -Path /workspace/notebook/a,/tmp/outside/b",
          location,
        },
        { ...posix, env: { SHELL: shell } },
      ),
    ).toEqual(["/tmp/outside"])
  },
)

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
