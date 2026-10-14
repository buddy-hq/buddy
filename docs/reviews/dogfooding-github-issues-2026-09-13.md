# Dogfooding Issues (2026-09-13)

Actionable issues from Prashant's two dogfooding recordings (learning "Building an LLM from scratch" in a new notebook, Muse Spark 1.3 Free at Extra High, installed dev build from the `Obsidian` branch).

- **Video 1:** `~/Desktop/Screen Recording 2026-09-13 at 13.45.17.mov` (16m51s)
- **Video 2:** `~/Movies/2026-09-13 14-15-29.mkv` (26m50s)
- **Transcripts:** `~/Desktop/dogfooding_transcripts_2026-09-13/*.srt`

## Method & confidence

- Every issue below was checked against extracted video frames at the transcript timestamp, not against the transcript alone. Video 2's SRT uses long Whisper segments, so its timestamps are ±10s.
- Code pointers are from `Obsidian` @ `4e9661567` (20 commits ahead of `main`). The recorded build may be a few commits older.
- Fixes start after `Obsidian` merges into `main`; re-check line numbers then. Three files named below differ between `main` and `Obsidian` today — `bench-tabs.tsx`, `user-message.tsx`, `use-workspace-file-open.ts` — so work from the merged version.
- **Confirmed** = seen in frames and located in code. **Suspected** = symptom confirmed, cause not reproduced.
- Frames were extracted to `/tmp/dogfood-2026-09-13/frames/` (ephemeral). Regenerate one with:
  `ffmpeg -ss 00:06:46 -i "<video>" -frames:v 1 frame.jpg`

## Corrections to the earlier draft

- Model was **Muse Spark 1.3 Free**, not "Nous 1.3 Spark".
- `/whiteboard` did not swallow input or fail to match. The Whiteboard **skill ran and drew the board**; the defect is that the user's turn never appeared (DF-09).
- A memory feature and a `goals.json` store already exist; the gap is that nothing carries notebook goals into new chats (DF-06).
- No "quick check" instruction exists in `resolve-confusion`; the behaviour traces to the CFU principle and the concise-response rules (DF-01, DF-03).
- The chat-ID pointer (`debug/easel/notebook-dialog-redesign.tsx`) was an Easel prototype, not the shipped dialog.
- Several draft screenshots did not show what their captions claimed.

## Triage status

All items were triaged on 2026-09-25 and moved to the dogfooding folder of the main `buddy` checkout (`docs/dogfooding/`):
- `to-review.md`: fixed, awaiting review in the app. None from this review.
- `todo.md`: deferred, with full evidence: DF-01, DF-02, DF-03, DF-05, DF-06, and the exact-prose prompt test prerequisite.
- `stale.md`: already resolved or not actionable: DF-07 to DF-14, and the "small chat mode" note.
- DF-04 was removed; it's being fixed in a separate chat.

