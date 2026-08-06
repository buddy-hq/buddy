# Buddy launch video

The launch film is assembled in Remotion from the `BuddyLaunch` composition.

## Two-minute rough-cut canvas

The composition is fixed at 1920×1080, 30 FPS, and 2:00 while the story is
being assembled. The completed Feynman opening is followed by alternating
scene and transition slots.

The source of truth is
`src/timeline/launchTimeline.ts`. Each scene entry declares its exact duration,
culmination frame, and optional `source`.

To replace a black placeholder:

1. Put the recording below `public/scenes/`.
2. Find the slot by `id` in `launchTimeline.ts`.
3. Change `source: null` to a public path such as
   `source: "scenes/command.mp4"`.
4. Set `muted: false` only when the recording's own audio should be heard.

Transitions are timeline entries too. Use `style: "text"` with `copy`, or
`style: "fade"` for a black fade slot. Durations can change freely as long as
the timeline still totals two minutes; the final canvas slot automatically
absorbs the remaining frames.

Preview from the repository root:

```sh
bun play
```

Render every delivery target except the short preview, from the repository
root:

```sh
bun render
```

The command renders sequentially and writes these descriptive, share-ready
files under the composition's own output directory:

```text
packages/videos/out/buddy-launch/
├── buddy-launch-master.mp4
├── buddy-launch-linkedin.mp4
├── buddy-launch-web.mp4
└── buddy-launch-whatsapp.mp4
```

Render only one target when you do not need the full set:

```sh
bun run --cwd packages/videos render:master
bun run --cwd packages/videos render:linkedin
bun run --cwd packages/videos render:web
bun run --cwd packages/videos render:whatsapp
```

Every delivery render uses lossless PNG frame handoff and explicitly tagged
BT.709 color primaries, transfer, and matrix. It is written to a staging file,
normalized to −15 LUFS with a −1 dBTP ceiling, fully decoded as a corruption
check, moved to a fast-start MP4, and only then published under its final
filename. The verifier also checks the dimensions, frame rate, frame count,
pixel format, color tags, audio codec, channel layout, and sample rate.
Cancelling or failing a render therefore preserves the last valid export.

| Target | Video | Audio | Intended use |
| --- | --- | --- | --- |
| Master | H.264 CRF 16, slower | AAC 320 kbps | Highest-quality archive and source upload |
| LinkedIn | H.264 CRF 18, slow | AAC 192 kbps | Organic LinkedIn post |
| Web | H.264 CRF 20, slower | AAC 160 kbps | Progressive website playback |
| WhatsApp | 1280×720 H.264 CRF 18, slower | AAC 128 kbps | WhatsApp HD-sized share without CRF 28 motion smearing |

The shorter preview remains a separate, opt-in command:

```sh
bun run --cwd packages/videos render:preview
```

Render a representative frame to
`packages/videos/out/buddy-launch/stills/check.png`:

```sh
bun run --cwd packages/videos render:launch:check
```

Choose a prompt from `prompts.json`, decide whether to submit it, then type it into
the installed production Buddy app:

```sh
bun type
```

Type a specific prompt directly:

```sh
bun type "Make me a solar-system game"
```

The script reactivates Buddy, waits 400 ms, then types at 35 ms per character.
Use `bun type --submit "Prompt"` to press Return after typing. The terminal
needs macOS Accessibility permission.

Change persistent defaults in
[scripts/type-prompt.config.ts](scripts/type-prompt.config.ts); edit
`prompts.json` to change the interactive prompt options.

Set `timing.wordsPerMinute` directly: 40 is slow, 60 is average, and 100 is
fast.
