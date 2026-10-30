---
name: handy-voice
description: "Dictate into Buddy with Handy: install, model choice, settings file, macOS permissions."
---

# Voice input

Use when the user wants to dictate, use voice, or type by speaking. Buddy has no voice recorder and no voice setting. Handy, a separate local app, transcribes on this computer and pastes the text into whichever field is focused, including Buddy's chat box.

Not a Buddy install (`setup.md`). Not a provider (`providers.md`).

Handy is the open-source app at [github.com/cjpais/Handy](https://github.com/cjpais/Handy) ([handy.computer](https://handy.computer)). Speech stays on this machine. The steps below are for Handy **0.9.8**. After an update, trust `handy --list-models` on that install over the table here.

The model change and a headless transcription were run on an Apple M2 Pro with 16 GB memory, macOS 26.4, where Handy **0.9.8** was already installed. A fresh install was not. Windows is written from Handy 0.9.8 source and docs and is marked **not yet verified**.

## Install on macOS

Fresh installation was **not** verified. The cask that was checked declares macOS 13 or later and version **0.9.8**. The documented command is:

```bash
brew install --cask handy
```

The Homebrew cask is not maintained by the Handy developers (Handy README).

On this Mac that command exited 1. Handy was already at `/Applications/Handy.app`. Homebrew printed `It seems there is already an App at '/Applications/Handy.app'` and left it in place. What was verified is that existing app, changing its model, and transcribing a clip. Read the version and continue when it is 0.9.8 or newer:

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/Handy.app/Contents/Info.plist
```

The app is not put on `PATH`. Call the binary:

```text
/Applications/Handy.app/Contents/MacOS/handy
```

`handy --help` on 0.9.8 lists `--start-hidden`, `--no-tray`, `--toggle-transcription`, `--toggle-post-process`, `--cancel`, `--debug`, `--list-models`, `--list-devices`, and `--transcribe-file`.

## Choose a model

Run both. Log lines may print before the JSON array; parse from the line that is `[`.

```bash
/Applications/Handy.app/Contents/MacOS/handy --list-models --json
/Applications/Handy.app/Contents/MacOS/handy --list-devices
```

Use a model with `"is_recommended": true` whose `supported_languages` include the language the person dictates. Set `selected_model` to that entry's `id`. Do not rename model files.

Verified recommended set on Handy 0.9.8:

| Model | `id` to store | Size | Languages | What Handy says |
| --- | --- | --- | --- | --- |
| Parakeet Unified EN 0.6B | `handy-computer/parakeet-unified-en-0.6b-gguf/parakeet-unified-en-0.6b-Q8_0.gguf` | 697 MB | English | Fast, accurate live English transcription |
| Nemotron Streaming 3.5 | `handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf/nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf` | 716 MB | 28 languages | Live multilingual transcription across 28 languages |
| Canary 180M Flash | `handy-computer/canary-180m-flash-gguf/canary-180m-flash-Q8_0.gguf` | 208 MB | 4 languages | Tiny and instant, runs well on any hardware |
| Cohere Transcribe | `handy-computer/cohere-transcribe-03-2026-gguf/cohere-transcribe-03-2026-Q5_K_M.gguf` | 1688 MB | 14 languages | Highest accuracy, 14 languages, slower |
| Whisper Medium | `handy-computer/whisper-medium-gguf/whisper-medium-Q8_0.gguf` | 793 MB | 99 languages | Broadest language, but may run a bit slow |
| Parakeet V3 | `parakeet-tdt-0.6b-v3` | 456 MB | 25 European languages | Fast and accurate. Supports 25 European languages |

**English, and the disk can hold about 700 MB:** Parakeet Unified EN 0.6B. That is the recommended English model. On the M2 Pro above, `--list-devices` reported Metal (`index=0`, Apple M2 Pro, about 12124 MB) and CPU. A 2.08 second clip transcribed on Metal (`MTL0`) in 0.54 seconds after an 811 ms load.

**Less than 1 GB free on the home volume:** do not download the 697 MB file. Use Canary 180M Flash for English, German, Spanish, or French. Otherwise use the smallest recommended model whose languages include theirs and whose `source` is `HuggingFace`.

Canary does not detect the language. In the Handy 0.9.8 catalog its `lang_detect` capability is false, and `--list-models` shows `supports_language_detection` false. A new settings file sets `settings.selected_language` to `auto`. Handy then uses English (`effective_language` prefers `en` when the model cannot detect a language). When the person dictates German, Spanish, or French with Canary, set `settings.selected_language` to that model's code: `de`, `es`, or `fr`. Those strings are the `languages` list on Canary 180M Flash in that catalog.

The same holds for every model whose `supports_language_detection` is false in `--list-models`, Cohere included (for example `ja` for Japanese with Cohere). Set `settings.selected_language` to the person's language code from that model's `languages` list whenever they do not dictate English.

**Another language:** among recommended HuggingFace models that list that language, prefer the description that matches. Cohere and Whisper Medium say they can be slow; say that when you pick one.

Parakeet V3's id in 0.9.8 is an app-managed package, not a single file placed by the steps below. Use it when `--list-models` already shows `"is_downloaded": true`. Otherwise pick a recommended HuggingFace model.

Check free space with `df -h "$HOME"`.

Upstream also publishes benchmarks at [models.handy.computer](https://models.handy.computer/): Parakeet Unified EN 0.6B is the English overall and fast pick there (Q8_0 about 0.68 GB; 14.0× realtime on an AMD Ryzen 4750U CPU and 25.3× on that GPU). The wording in the table above is what Handy 0.9.8 printed.

## Put the model in place

Verified for Parakeet Unified EN 0.6B. The file can be downloaded while Handy is running. Quit Handy before changing `settings_store.json`, or the running app can write the old model back.

```bash
mkdir -p "$HOME/Library/Application Support/com.pais.handy/models"
curl -fL --retry 3 -o "$HOME/Library/Application Support/com.pais.handy/models/parakeet-unified-en-0.6b-Q8_0.gguf.partial" \
  "https://huggingface.co/handy-computer/parakeet-unified-en-0.6b-gguf/resolve/main/parakeet-unified-en-0.6b-Q8_0.gguf"
```

The file must be **731357568** bytes. SHA-256, from Handy's catalog revision `7e948f21b7bdbac698d3318db9d350f1096f3b6c` and checked on the download:

```text
4b50b6dd862bf6e346929aaf4f5eaacec003bfa3f56462d6c874b41ef2f38795
```

If the hash matches, move the partial file onto the final name. Do not leave the `.partial` suffix. If a later Handy lists a different revision for this model, do not install a file that fails the hash printed by that revision.

Other HuggingFace models use the same pattern: `https://huggingface.co/<repo_id>/resolve/main/<filename>` saved as `<filename>` in the models directory. `repo_id` and `filename` are on the `--list-models` entry. The README also lists this direct URL for the Q8_0 file.

Confirm:

```bash
/Applications/Handy.app/Contents/MacOS/handy --list-models --json
```

The chosen id should show `"is_downloaded": true`.

Optional check, no microphone. The WAV must be 16 kHz mono. Verified with `say` and `afconvert -f WAVE -d LEI16@16000 -c 1`:

```bash
/Applications/Handy.app/Contents/MacOS/handy --transcribe-file /path/to.wav \
  --model "handy-computer/parakeet-unified-en-0.6b-gguf/parakeet-unified-en-0.6b-Q8_0.gguf" \
  --json
```

That run returned the spoken sentence and `"bound_backend": "MTL0"`.

## Settings file

Verified path:

```text
~/Library/Application Support/com.pais.handy/settings_store.json
```

The store is one object with a `settings` key. Set:

- `settings.selected_model` to the `id` from `--list-models`
- `settings.onboarding_completed` to `true` once a model is selected, so the first-run screen is not waiting
- `settings.selected_language` to the person's language code when the model's `supports_language_detection` is false and they do not dictate English: `de`, `es`, or `fr` for Canary, `ja` for Japanese with Cohere. Such a model does not detect the language. The default value is `auto`, which Handy treats as English for that model.

If the file is missing, start Handy once with `--start-hidden`, quit, then edit the file it wrote. A brand-new file was not created in the verification run; this Mac already had one.

If `settings.bindings` already exists, change the model, onboarding when it is still false, and `selected_language` when a model without language detection needs a non-English code. Do not reset shortcuts. The verified edit on this Mac changed only `selected_model` and left an existing transcribe binding in place. That machine was already on English, so `selected_language` was not part of the verified edit.

Defaults when the file is new, from the app and from `default_binding` loaded on this Mac:

| Binding | macOS | Windows (from source, not yet verified) |
| --- | --- | --- |
| Transcribe | `option+space` | `ctrl+space` |
| Transcribe with post-processing | `option+shift+space` | `ctrl+shift+space` |
| Cancel | `escape` | `escape` |

A new install uses `shortcut_activation` `hold_or_toggle`. A press held at least `hold_threshold_ms` (default **300**) records while held. A shorter press turns recording on until the next press. `toggle` is press to start and press again to stop. `push_to_talk` records only while held.

Quit before editing, or the running app can write the old model back:

```bash
osascript -e 'tell application "Handy" to quit'
```

Wait until `pgrep -f '/Applications/Handy.app/Contents/MacOS/handy'` prints nothing. Then edit the JSON. Then start:

```bash
open -a /Applications/Handy.app --args --start-hidden
```

Verified: after that launch the log line `Loaded settings` contained the new `selected_model`, and the process was `/Applications/Handy.app/Contents/MacOS/handy --start-hidden`.

Logs: `~/Library/Logs/com.pais.handy/handy.log`.

## Permissions the person must grant

The command line cannot grant these. Do not say the CLI did it. This is separate from the settings-file edit.

On a fresh macOS install, Handy opens **Permissions Required** and only checks access. It does not ask for the microphone until the person uses the button on that screen.

- **Microphone** — On the **Microphone Access** card, the person presses **Grant Permission**. macOS then shows its own prompt, and the person confirms it. If they deny that prompt, they allow **Handy** under **System Settings → Privacy & Security → Microphone**.
- **Accessibility** — required on macOS for the global shortcut and for pasting into Buddy's chat box. The same screen has an **Accessibility Access** card with **Grant Permission**. If that does not stick, allow **Handy** under **System Settings → Privacy & Security → Accessibility**.

Handy does not leave that screen until both are allowed. This Mac already had both, so no prompt appeared. An earlier Handy log on this machine showed microphone samples and a successful paste. That is not a substitute for the person allowing them on a new install.

## Dictate into Buddy

1. Handy is running (the launch above, or the menu-bar icon).
2. Click Buddy's chat box so the cursor is in it.
3. Press the transcribe shortcut. On a fresh macOS install that is **Option+Space**. If settings already have a binding, use `settings.bindings.transcribe.current_binding` and do not replace it.
4. Speak.
5. Stop the way `shortcut_activation` says (hold-or-toggle, toggle, or push-to-talk, above).
6. Handy pastes the words into the chat box. The person sends the message.

**Escape** cancels a recording (unless that binding was changed).

Do not run `--toggle-transcription` while setting this up. It starts or stops a recording on the running app.

## Windows (not yet verified)

From the Handy README, not run on a Windows machine:

```powershell
winget install cjpais.Handy
```

The README says the winget package is not maintained by the Handy developers. The same README says the CLI flags work on Windows, and its example binary path is:

```powershell
& "$env:ProgramFiles\Handy\handy.exe"
```

A per-user install may use a different folder. Do not invent a path if that one is missing; find `handy.exe`. The commands below use the paths this reference already names. None of them were run on Windows.

Model folder and settings file:

```text
%APPDATA%\com.pais.handy\models
%APPDATA%\com.pais.handy\settings_store.json
```

Download the chosen model into that models folder, stop Handy, wait until that process has exited, then edit settings, then relaunch. If Handy does not exit within 30 seconds, stop. Do not edit the file or relaunch. Same fields as macOS: `settings.selected_model`, `settings.onboarding_completed`, and `settings.selected_language` when Canary is used for German, Spanish, or French (`de`, `es`, or `fr`). Keep every other key, including bindings. If the settings file does not exist yet, start Handy once with `--start-hidden`, stop it after the file appears, then edit.

```powershell
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path "$env:APPDATA\com.pais.handy\models"
$partial = "$env:APPDATA\com.pais.handy\models\parakeet-unified-en-0.6b-Q8_0.gguf.partial"
Invoke-WebRequest -Uri "https://huggingface.co/handy-computer/parakeet-unified-en-0.6b-gguf/resolve/main/parakeet-unified-en-0.6b-Q8_0.gguf" -OutFile $partial
$hash = (Get-FileHash -Algorithm SHA256 -Path $partial).Hash.ToLowerInvariant()
if ($hash -ne "4b50b6dd862bf6e346929aaf4f5eaacec003bfa3f56462d6c874b41ef2f38795") { throw "hash mismatch" }
Move-Item -Force -Path $partial -Destination "$env:APPDATA\com.pais.handy\models\parakeet-unified-en-0.6b-Q8_0.gguf"
$handy = @(Get-Process handy -ErrorAction SilentlyContinue)
if ($handy.Count -gt 0) {
  $handy | Stop-Process -ErrorAction Stop
  $handy | Wait-Process -Timeout 30 -ErrorAction Stop
}
$store = "$env:APPDATA\com.pais.handy\settings_store.json"
$json = Get-Content -Raw -Encoding UTF8 -Path $store | ConvertFrom-Json
$json.settings.selected_model = "handy-computer/parakeet-unified-en-0.6b-gguf/parakeet-unified-en-0.6b-Q8_0.gguf"
$json.settings.onboarding_completed = $true
[IO.File]::WriteAllText($store, ($json | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
Start-Process "$env:ProgramFiles\Handy\handy.exe" -ArgumentList "--start-hidden"
```

For another HuggingFace model, change the URL, the file name, the expected SHA-256, and `selected_model` to the `id` from `--list-models`. The hash is that file's `sha256` in the Handy catalog. Keep the hash check. If `$env:ProgramFiles\Handy\handy.exe` is missing, use the `handy.exe` that is actually installed.

When the model is Canary 180M Flash Q8_0 (`canary-180m-flash-Q8_0.gguf`), the Handy 0.9.8 catalog SHA-256 is `e13c7f5d0952b056a027cfffec13e3a3a134d1608babed24f983568f141e297c`. For German, Spanish, or French, insert this line immediately before `WriteAllText`:

```powershell
$json.settings.selected_language = "de"
```

Use `es` or `fr` instead of `de` for Spanish or French. Do the same for any other model whose `supports_language_detection` is false, with the person's code from its `languages` list (for example `ja` with Cohere).

On Windows, Handy's first-run screen asks for the microphone only. The button is **Open System Settings**. It opens Windows microphone privacy settings (`ms-settings:privacy-microphone`). Handy is a desktop app, so desktop-app microphone access has to be allowed. A device-wide microphone deny also blocks it. Accessibility is not part of Windows setup. This was not run on a Windows machine. Do not claim the permission was granted.

Default shortcuts in the Windows column above are from the app source, not from a Windows run.

## Guardrails

- Do not say Buddy has built-in voice, a voice mode, or a voice setting.
- Do not `brew uninstall --zap` or delete `~/Library/Application Support/com.pais.handy`. That removes the person's Handy settings and models.
- Do not replace an existing shortcut when only the model changes.
- A Bluetooth headset microphone on macOS can make playback quieter while Handy is recording (Handy README). The Mac's built-in microphone avoids that.
- Shortcuts that use the **fn** / Globe key work on Apple keyboards only (Handy README).

## Related

`chat.md` — the chat box; `setup.md` — installing Buddy; `trust.md` — local data and permission prompts inside Buddy (those are separate from macOS Microphone and Accessibility for Handy).
