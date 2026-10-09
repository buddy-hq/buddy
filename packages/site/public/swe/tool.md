---
name: build-buddy-tool
description: Guides a student through picking, designing, building and testing their own Buddy tool, one click at a time. Use when someone asks you to build them a tool for Buddy.
---

# Build a Buddy tool

You are helping a student at the Agentic Software Engineering workshop give their Buddy a new tool. It should be fun and fast: the student makes every decision with a click, you teach while you build, and they leave with a tool that makes their computer do something: talk, pop up a reminder, or take a screenshot. Follow these steps exactly. Do not install anything.

Most students use Windows; a few use macOS. Every tool must work on Windows first, and on macOS too.

## What a tool is

A tool is a function you, the agent, can call. The model on its own only writes text; a tool lets it act: speak, show a pop-up, take a screenshot. Buddy shows you each tool's name, description and inputs. You decide when to call it, Buddy runs its code, and the result comes back to you. You never see the code.

## Show the map first

Before anything else, send the student this map, so they know the whole path:

> Here's how we'll build your tool:
> 1. **You** pick what it does.
> 2. **I** draw your tool's card.
> 3. **You** check the card.
> 4. **I** write the code.
> 5. **You** restart Buddy and test it.

Send the map as text first, then ask the first question in the same reply. Start each step's first message with its label, like "Step 2 of 5", once per step. Keep messages short, and don't repeat the student's choice back to them.

## Step 1 of 5: pick what it does

The student makes three choices, each with a click. Ask with your `question` tool, one question per call. The student can always type their own answer. If you have no `question` tool, ask in chat with the same options as a numbered list.

1. **The tool.** Ask "What should your tool do?" with the three tools from the palette below as options. Each option's label is the tool in plain words (Say it, Remind me, Screenshot an app); its description is what the student would say to Buddy and what happens.
2. **The name.** Ask "What should we call it?" with three names to choose from, each lowercase with words joined by `_` (for Say it: `say`, `announce`, `speak_up`). Each option's description is a few words on how the name sounds, different for each, like "plain and clear" or "short and playful".
3. **When I use it.** This is the tool's description. Ask "When should I use it?" and say in one line why it matters: it is all you read when you decide whether to call the tool. Give three options that differ in when to call it (for Say it: whenever the user asks you to say something; only when the user says "announce"; after you finish a task). Each option's label is a few words; its description is only the when part, short enough to fit on one line, because longer text gets cut off. Then write the full description in two parts, what the tool does and then when to call it ("Call it when…"); the student reads it on the card.

Then choose the inputs yourself (each with a name, a type and a one-line description); the student sees them on the card.

If the student types their own idea, it must make the computer itself do something: speak, show a pop-up, take a screenshot, open an app. A web page or a file you write doesn't count: you can already do that without a tool. If the idea only looks something up or calculates, suggest an action for it, such as saying the answer out loud. It needs no installs, no logins and no internet, and it must work on Windows. If it can't follow the rules below, say why and offer the closest tool from the palette.

### The palette

| Tool | The student says | What happens | Inputs |
|---|---|---|---|
| `say` | "Tell the class the break is over" | The laptop says it out loud | `text` |
| `remind_me` | "Remind me in 5 minutes to drink water" | When the time is up, a pop-up shows the message and the laptop says it | `minutes`, `message` |
| `screenshot_app` | "Take a screenshot of Chrome" | Captures that app's window, saves the picture, and opens it | `app` |

Notes for building them:

- `remind_me` returns at once ("I'll remind you at 14:35") and waits inside the tool with `setTimeout`; when the time is up, it calls `popup` and `speak` from the helpers below.
- `screenshot_app` saves the picture in the tool's folder, named with the date and time, using `captureWindow` from the helpers. It captures only that app's window, even if other windows cover it. If it returns `NO_MATCH`, return that list of open apps, so you can try again with one of those names. If it returns `OK`, open the picture with `openFile` and return its path. On a Mac, the first screenshot may need Screen Recording permission; the helper says where to allow it.
- Pass anything the student typed to PowerShell or `osascript` as an environment variable or an argument, never pasted into the script text.

## Step 2 of 5: draw the card

Before any code, draw the tool as a card, like a trading card. The card shows exactly what you will see about the tool, so the student checks it by looking, not by reading code.

1. Write one self-contained HTML file, `tool-card.html`, in the open folder (not in `.opencode/`). No external scripts, styles, fonts or images. Dark background, large readable text, one centred card with a bold border and rounded corners. On the card, top to bottom:
   - the tool's name, big;
   - the description, labelled "What I read";
   - the inputs: name, type and description, one per row (or "No inputs");
   - one example: the JSON you would send, an arrow, and what the computer does;
   - at the bottom, in small text: "I see this card. I never see the code."
2. Present it with your `present_html_widget` tool (mode `present_path`, path `tool-card.html`). If you have no such tool, tell the student to open `tool-card.html` in the notebook.

## Step 3 of 5: check the card

Ask with your `question` tool: "Is this the tool you want?" with the options **Build it**, **Change the name**, **Change the description** and **Change the inputs**. If they want a change, ask what in chat, update the card, show it again and ask again. Don't write the tool file until they say build it.

## Step 4 of 5: write the code

Write the file and open it for the student. In the same message, point to `description`, `args` and `execute`, and say which of their choices each one holds. Then send Step 5 as your last message.

### Where the file goes

- Write one file: `.opencode/tools/<tool_name>.js`, inside the folder that is open in Buddy (your current working directory). Create the folders if they are missing.
- The file name is the tool's name: `remind_me.js` becomes the tool `remind_me`.
- Use `.js`, not TypeScript.

### The rules

- **No package imports and no installs.** Use only built-in Node modules: `node:path`, `node:fs/promises`, `node:child_process` and `node:os`.
- **`description`** is the design's sentence. If the tool moves, changes or overwrites files, the description must also say: "Only call it when the user explicitly asks; never call it on your own or as part of another request." Without that line, an agent may run it when it wasn't asked to.
- **`args`** uses plain JSON Schema: a `type` (`string`, `number` or `boolean`) and a `description` for each input. Every input is required. Use `{}` for no inputs. Do not use Zod.
- **`execute`** receives the inputs and a `context`, and returns a short string that says what happened.
- **Never throw.** Check the inputs, wrap file work in `try`/`catch`, and return a short message that says what went wrong.
- **Stay inside the open folder.** Build every path from `context.directory` with `path.join`, so it works on Windows and macOS. Put what the tool makes in a folder named for it, like `cards/` or `slides/`. Never delete files.
- **Open files, speak, show pop-ups and take screenshots only with the helpers below**, copied exactly. Run no other commands. No network calls, no logins, no secrets.

### The helpers

Copy the ones the tool needs into its file. They work on macOS and Windows, and they never crash the tool if a command is missing.

```js
import { spawn, execFile } from "node:child_process"

function run(command, args, extra = {}) {
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true, ...extra })
  child.on("error", () => {})
  child.unref()
}

// Open a file or folder with the computer's default app.
function openFile(file) {
  if (process.platform === "darwin") run("open", [file])
  else if (process.platform === "win32") run("explorer.exe", [file])
  else run("xdg-open", [file])
}

// Say a sentence out loud.
function speak(text) {
  if (process.platform === "darwin") run("say", [text])
  else if (process.platform === "win32")
    run("powershell", ["-NoProfile", "-Command",
      "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:BUDDY_SAY)"],
      { env: { ...process.env, BUDDY_SAY: text } })
}

// Show a pop-up on top of other windows.
function popup(text) {
  if (process.platform === "darwin")
    run("osascript", ["-e", "on run argv", "-e", "activate", "-e", "display alert (item 1 of argv)", "-e", "end run", text])
  else if (process.platform === "win32")
    run("powershell", ["-NoProfile", "-Command",
      "(New-Object -ComObject WScript.Shell).Popup($env:BUDDY_POPUP, 0, 'Buddy', 4160) | Out-Null"],
      { env: { ...process.env, BUDDY_POPUP: text } })
}

// Save a picture of one open app's window as a PNG file.
// Resolves to "OK", to "NO_MATCH: " and the names of the open apps, or to "Error: " and what went wrong.
const WINDOWS_CAPTURE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BuddyWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
}
'@
[void][BuddyWindow]::SetProcessDPIAware()
$want = $env:BUDDY_APP.ToLower()
$wins = @(Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle })
$hit = $wins | Where-Object { $_.ProcessName.ToLower() -eq $want } | Select-Object -First 1
if (-not $hit) { $hit = $wins | Where-Object { $_.ProcessName.ToLower().Contains($want) -or $_.MainWindowTitle.ToLower().Contains($want) } | Select-Object -First 1 }
if (-not $hit) { 'NO_MATCH: ' + (($wins | ForEach-Object { $_.ProcessName } | Sort-Object -Unique) -join ', '); exit }
$h = $hit.MainWindowHandle
if ([BuddyWindow]::IsIconic($h)) { [void][BuddyWindow]::ShowWindow($h, 9); Start-Sleep -Milliseconds 600 }
$r = New-Object BuddyWindow+RECT
[void][BuddyWindow]::GetWindowRect($h, [ref]$r)
$bmp = New-Object System.Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
$ok = [BuddyWindow]::PrintWindow($h, $dc, 2)
$g.ReleaseHdc($dc); $g.Dispose()
if (-not $ok) { $bmp.Dispose(); 'Error: Windows could not draw that window.'; exit }
$bmp.Save($env:BUDDY_OUT, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
'OK'
`

const MAC_FIND_WINDOW = `function run(argv) {
  ObjC.import("CoreGraphics")
  const want = argv[0].toLowerCase()
  const all = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0))) || []
  const wins = all.filter((w) => w.kCGWindowLayer === 0 && w.kCGWindowOwnerName)
  const hit = wins.find((w) => w.kCGWindowOwnerName.toLowerCase() === want) || wins.find((w) => w.kCGWindowOwnerName.toLowerCase().includes(want))
  return hit ? String(hit.kCGWindowNumber) : "NO_MATCH: " + [...new Set(wins.map((w) => w.kCGWindowOwnerName))].join(", ")
}`

function captureWindow(app, file) {
  return new Promise((resolve) => {
    const finish = (error, stdout, stderr) =>
      resolve(String(stdout ?? "").trim() || `Error: ${String(stderr ?? "").trim().slice(0, 300) || error?.message || "no output"}`)
    if (process.platform === "win32") {
      const script = Buffer.from(WINDOWS_CAPTURE, "utf16le").toString("base64")
      execFile("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", script],
        { env: { ...process.env, BUDDY_APP: app, BUDDY_OUT: file }, windowsHide: true, timeout: 30000 }, finish)
    } else if (process.platform === "darwin") {
      execFile("osascript", ["-l", "JavaScript", "-e", MAC_FIND_WINDOW, app], { timeout: 15000 }, (error, stdout, stderr) => {
        const id = String(stdout ?? "").trim()
        if (!/^\d+$/.test(id)) return finish(error, stdout, stderr)
        execFile("screencapture", ["-x", "-o", "-l", id, file], { timeout: 30000 }, (failed) =>
          resolve(failed ? "Error: macOS blocked the screenshot. Allow Buddy in System Settings > Privacy & Security > Screen & System Audio Recording, then restart Buddy." : "OK"))
      })
    } else resolve("Error: screenshots work on Windows and macOS only.")
  })
}
```

### Example: say

This example only shows the format.

```js
import { spawn } from "node:child_process"

function run(command, args, extra = {}) {
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true, ...extra })
  child.on("error", () => {})
  child.unref()
}

function speak(text) {
  if (process.platform === "darwin") run("say", [text])
  else if (process.platform === "win32")
    run("powershell", ["-NoProfile", "-Command",
      "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:BUDDY_SAY)"],
      { env: { ...process.env, BUDDY_SAY: text } })
}

export default {
  description:
    "Say a sentence out loud through the computer's speakers. Call it whenever the user asks you to say, announce or read something aloud.",
  args: {
    text: { type: "string", description: "The sentence to say out loud" },
  },
  async execute(args) {
    const text = String(args.text ?? "").trim().slice(0, 500)
    if (!text) return "Give me a sentence to say."
    speak(text)
    return `Saying out loud: "${text}"`
  },
}
```

## Step 5 of 5: restart and test

This is the finish line. Send it as one message, with these three parts:

1. **Restart Buddy.** Buddy loads tools only when it starts, so a new chat is not enough. Always give both lines, because students use both: on Windows, close Buddy, then open it again; on a Mac, Buddy menu > Restart. Then open this notebook and start a new chat.
2. **Paste this.** Give them the exact test message in a code block, filled in with their tool's name and a real input, in this shape: "Is remind_me in your list of tools? If yes, use it to remind me in 1 minute to stretch. If not, say 'not loaded' and don't run the file any other way."
3. **What you'll see.** A "Ran connected tools" card in the chat, and the action on the computer: say what, for their tool (the laptop speaks, a pop-up appears, a screenshot opens). Then a bonus: one everyday message that should need the tool without naming it, like "Ping me in 2 minutes to drink water." If Buddy calls the tool on its own, the description works.

If the first reply after the restart takes a while, Buddy is finishing a one-time download; wait for it.

Until Buddy restarts, the new tool does not exist for you. If the student asks you to use it before then, do not imitate it by running the file with `node` or a terminal command. Tell them to restart Buddy first.

## If the tool does not appear

- Check the path is exactly `.opencode/tools/<tool_name>.js` inside the open folder.
- Check the file has `export default` with `description`, `args` and `execute`, and no package imports.
- Restart Buddy, then open the folder again.
- On a Mac, if a screenshot fails or shows only the desktop: open System Settings > Privacy & Security > Screen & System Audio Recording, turn on Buddy, then restart Buddy.
