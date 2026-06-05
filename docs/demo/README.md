# Buddy Demo Video

This folder contains the current Buddy demo video:

- `buddy-demo-live-electron.mp4`

The video is a real Electron app recording, not a presentation mockup. It shows Buddy creating a teaching pack from a fresh Quick Chat thread, including generated diagram, flashcard, and question content.

## Final Video

- File: `docs/demo/buddy-demo-live-electron.mp4`
- Resolution: 1920x1080
- Frame rate: 30 fps
- Duration: 92.4 seconds
- Audio: none
- Source behavior: real app generation captured live, then edited with cuts only. Visible generation is not sped up.

## Demo Prompt

```text
Make a concise teaching pack on why seasons happen. Use Buddy's diagram, flashcard, and question tools if they are available. Keep it short so I can review the result inside Buddy.
```

The selected model in the captured app session was `MiniMax M3 Free`.

## Capture Method

The web target was not reliable enough for this demo, so the recording used the desktop Electron app directly.

1. Built the Electron package:

   ```bash
   bun run --cwd packages/desktop-electron build
   ```

2. Launched the compiled Electron main process:

   ```text
   packages/desktop-electron/out/main/index.js
   ```

3. Used a temporary Electron capture runner to record the real renderer with `BrowserWindow.webContents.capturePage()` at 10 fps.

   This avoided the flaky paths I hit with browser automation and OS screen capture:

   - Playwright could launch the visible Electron window, but the automation handshake and cleanup were unreliable.
   - macOS `screencapture` did not produce usable display images from the shell session.
   - FFmpeg AVFoundation screen capture did not finalize cleanly.

4. The capture runner controlled the real app through Electron input events:

   - clicked the sidebar new-thread button
   - focused `[data-component="prompt-editor"]`
   - typed the prompt character by character with `webContents.sendInputEvent`
   - clicked `[data-action="prompt-submit"]`
   - recorded until the submit button left the `Stop` state and the session settled

The live run took about 205 seconds and reached the expected idle state after generating the teaching content.

## Editing Method

The raw frame sequence was encoded into a source MP4:

```bash
ffmpeg -framerate 10 \
  -i /tmp/buddy-demo-video-capture/2026-06-04T18-51-38-748Z/frames/frame-%06d.png \
  -vf scale=1280:-2 \
  -c:v libx264 \
  -preset veryfast \
  -crf 23 \
  -pix_fmt yuv420p \
  artifacts/buddy-demo-video/buddy-demo-raw-live-capture.mp4
```

The final story was cut from real-time excerpts of the raw capture. No generation footage was sped up; only idle gaps and long waits were removed.

The selected source frame ranges were:

- `0-260`
- `690-830`
- `1230-1510`
- `1760-2004`

## Remotion Pass

The final motion layer was produced with a temporary isolated Remotion project under `artifacts/buddy-demo-video/remotion`.

The Remotion composition:

- used `OffthreadVideo` for the base edit
- framed the app recording at 1920x1080
- added subtle motion framing, a minimal progress rail, corner brackets, and short labels
- avoided slide-style layouts and text-heavy presentation treatment

Render command:

```bash
npm run --prefix artifacts/buddy-demo-video/remotion render
```

The silent audio track was removed after rendering:

```bash
ffmpeg -i artifacts/buddy-demo-video/buddy-demo-final.mp4 \
  -an \
  -c:v copy \
  artifacts/buddy-demo-video/buddy-demo-final.no-audio.mp4
```

The temporary Remotion project, intermediate captures, raw clips, and helper scripts were deleted after moving the final MP4 into this folder.
