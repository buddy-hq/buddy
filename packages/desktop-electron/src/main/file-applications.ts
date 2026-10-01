import { stat } from "node:fs/promises"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const MAC_DEFAULT_APPLICATION = `function run(argv) {
  ObjC.import("AppKit");
  const file = $.NSURL.fileURLWithPath(argv[0]);
  const application = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(file);
  return application ? ObjC.unwrap(application.path) : "";
}`

// Run as `& { ... } '<base64>'`: extra arguments after -Command are appended to the command
// text rather than bound to $args, so the path is passed as a script block parameter.
const WINDOWS_DEFAULT_APPLICATION = `param($encodedPath)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FileAssociation {
  [DllImport("Shlwapi.dll", CharSet = CharSet.Unicode)]
  public static extern uint AssocQueryString(uint flags, uint str, string association, string extra, StringBuilder output, ref uint length);
}
'@
$extension = [IO.Path]::GetExtension([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedPath)))
if (-not $extension) { exit 0 }
$length = [uint32]1024
$output = New-Object Text.StringBuilder 1024
$result = [FileAssociation]::AssocQueryString(0, 2, $extension, $null, $output, [ref]$length)
if ($result -eq 0) { $output.ToString() }
`

/** Resolve the OS association for this file, independent of the user's last menu choice. */
export async function resolveDefaultFileApplication(input: {
  readonly platform: NodeJS.Platform
  readonly path: string
}): Promise<string | null> {
  const command =
    input.platform === "darwin"
      ? ([
          "osascript",
          ["-l", "JavaScript", "-e", MAC_DEFAULT_APPLICATION, "--", input.path],
        ] as const)
      : input.platform === "win32"
        ? ([
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              // Base64 has no quote characters, so it is safe inside a single-quoted literal.
              `& {${WINDOWS_DEFAULT_APPLICATION}} '${Buffer.from(input.path).toString("base64")}'`,
            ],
          ] as const)
        : null
  if (!command) return null
  try {
    const { stdout } = await execFileAsync(command[0], [...command[1]], {
      timeout: 5000,
      windowsHide: true,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/** An installed application that can receive a file through the native open bridge. */
export type FileApplication = {
  readonly id: string
  readonly name: string
  readonly path: string
}

type ApplicationCandidate = {
  readonly id: string
  readonly name: string
  readonly macBundle: string
  readonly windowsExecutable: string
  readonly linuxExecutable: string
}

const APPLICATIONS: readonly ApplicationCandidate[] = [
  {
    id: "cursor",
    name: "Cursor",
    macBundle: "Cursor.app",
    windowsExecutable: "Cursor/Cursor.exe",
    linuxExecutable: "cursor",
  },
  {
    id: "zed",
    name: "Zed",
    macBundle: "Zed.app",
    windowsExecutable: "Zed/Zed.exe",
    linuxExecutable: "zed",
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    macBundle: "Visual Studio Code.app",
    windowsExecutable: "Microsoft VS Code/Code.exe",
    linuxExecutable: "code",
  },
  {
    id: "vscode-insiders",
    name: "Visual Studio Code Insiders",
    macBundle: "Visual Studio Code - Insiders.app",
    windowsExecutable: "Microsoft VS Code Insiders/Code - Insiders.exe",
    linuxExecutable: "code-insiders",
  },
  {
    id: "sublime-text",
    name: "Sublime Text",
    macBundle: "Sublime Text.app",
    windowsExecutable: "Sublime Text/sublime_text.exe",
    linuxExecutable: "subl",
  },
]

/** Probe configured installation roots; applications are offered only when their launch target exists. */
export async function discoverFileApplications(input: {
  readonly platform: NodeJS.Platform
  readonly roots: readonly string[]
  readonly systemRoot?: string
}): Promise<readonly FileApplication[]> {
  const candidates = APPLICATIONS.map((application) => ({
    id: application.id,
    name: application.name,
    paths: input.roots.map((root) =>
      join(
        root,
        input.platform === "darwin"
          ? application.macBundle
          : input.platform === "win32"
            ? application.windowsExecutable
            : application.linuxExecutable,
      ),
    ),
  }))
  if (input.platform === "darwin") {
    candidates.push({
      id: "textedit",
      name: "TextEdit",
      paths: input.roots.map((root) => join(root, "TextEdit.app")),
    })
  } else if (input.platform === "win32" && input.systemRoot) {
    candidates.push({
      id: "notepad",
      name: "Notepad",
      paths: [join(input.systemRoot, "System32", "notepad.exe")],
    })
  }

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      for (const path of candidate.paths) {
        const target = await stat(path).catch(() => null)
        if (!target || (input.platform === "darwin" ? !target.isDirectory() : !target.isFile()))
          continue
        return { id: candidate.id, name: candidate.name, path }
      }
      return null
    }),
  )
  return results.filter((application) => application !== null)
}
