# Buddy launch video

Only decisions explicitly locked during brainstorming belong here.

## Locked decisions

| Decision | Notes |
|---|---|
| The video is product-only | No presenter, webcam, or talking head |
| The video has no voiceover | Music will accompany the visuals |
| Music uses a separate AI pipeline | That pipeline is outside this design discussion |
| The audience is lifelong learners | Self-directed adults following their own curiosity, not students working through an assigned syllabus |

## Working proposal: hero-frame arc spine

Not locked. This is the starting point for addition, removal, and reordering.

| Scene | Final hero composition | What it communicates | Exact product elements | Intensity |
|---|---|---|---|---:|
| **1. Command** | Buddy’s chat fills the composition. One ambitious prompt has just landed; everything else recedes visually. | Buddy begins with intent, not menus. | Normal chat, composer, submitted prompt; Bench closed | 20% |
| **2. Creation** | Chat compresses left; Bench opens with one polished visual explanation occupying most of the frame. | Buddy creates work beyond chat. | Docked Bench, chat, one diagram or figure from Creations, rail visible | 40% |
| **3. Immersion** | The artifact expands and consumes the frame; chat becomes a small secondary element. | Learning can become an immersive experience. | Immersive Bench, one interactive widget or visualization, small chat at the side or bottom | 60% |
| **4. Expansion** | A completed whiteboard stretches across the immersive canvas; the final connection snaps into place. | Buddy helps ideas become spatial and interconnected. | One whiteboard on Bench, Boards, immersive mode; no other Bench content | 80% |
| **5. Buddy** | The camera pulls back to reveal the complete product shell around one remaining hero artifact. | All these modes belong to one coherent learning companion. | Left sidebar and threads, central chat, rail, one Bench target, Buddy branding | Resolution |

Current shape:

`Command → Creation → Immersion → Expansion → [unplaced candidate frames] → Buddy`

## Working proposal: scene prompts

Not locked. Live copy is in [prompts.json](../../packages/videos/prompts.json), typed by `scripts/type-prompt.ts`.

Scenes are independent. Each prompt has to cold-justify its own hero frame with no memory of the scene before it, so none of them may be a follow-up. Subject variety is deliberate: five domains prove range, where one subject would make Buddy look narrow.

The one fixed point is the peak. [game.mp4](../../packages/videos/public/captures/game.mp4) captures **Solar Odyssey**, a solar-system spaceship journey on immersive Bench, so that prompt is dictated by the asset. The rest are free.

These are typed into production Buddy by `bun type`, so every prompt has to do two jobs at once: read as something a real person would write, and reliably steer Buddy to the Bench target the scene needs. Each one therefore carries a **steering phrase** that selects the surface. Removing it for brevity is what breaks the capture.

| Scene | Subject | Steering phrase | Why this subject |
|---|---|---|---|
| **1. Command** | The Moon not falling | none — chat only | Pure curiosity with no utility attached; the frame needs an ambitious prompt, not an artifact |
| **2. Creation** | Jet engine | "a proper labelled cutaway" | A cutaway is legible at a glance and rich enough to fill docked Bench |
| **3. Immersion** | Double pendulum | "drag, release and reset", "trails drawn" | Mesmerising in motion and meaningless as a still, so it can only pay off as an interactive widget |
| **4. Expansion** | Causes of the First World War | "on a whiteboard", "connect the causes" | A famously tangled web, so a sprawling board is the honest answer and the final link can snap into place |
| **5. Peak** | Solar Odyssey | "a game where I fly a ship" | Dictated by the existing capture |

Prompt constraints:

- **Long enough to be real.** Roughly 25–40 words. A six-word prompt cannot plausibly produce a whiteboard of the First World War, and Scene 1's frame calls for an *ambitious* prompt, which short text cannot look like.
- **Standalone.** No prompt may reference an earlier scene.
- **Curiosity voice, not assignment voice.**
- **Steering phrase preserved.** Product vocabulary is allowed exactly where it steers the surface; "whiteboard" and "game" are words a person would use anyway.

### Handoff from the Feynman cold open

The [transcript](transcripts/feynman-pleasure-of-finding-things-out.md) ends on "The prize is the pleasure of finding a thing out," and the crossfade to Buddy begins at composition frame 392, immediately after "out." Scene 1's prompt is therefore read as the answer to that line, which sets two constraints:

- **No vocabulary from the quote.** A prompt containing "discover", "find out", or "pleasure" restates Feynman instead of answering him, and reads as a caption rather than a cut.
- **A question, not a command.** The line is about wanting to know something, so "Show me" or "Build me" lands transactional in that position.

`Why doesn't the Moon just fall down?` satisfies both, and sits in physics without becoming Feynman pastiche. Alternates to test against it: `I still don't get why the Moon doesn't fall.` (warmer, wordier) and `What's actually holding the Moon up?` (tighter, but burns Scene 2's phrasing).

Typing should not begin on frame 392 — hold the empty composer roughly half a second first, so the cut registers as a new world before a person appears in it. Feynman's audio fades to near silence at 20 seconds, so the keystrokes overlap his voice trailing off.

## Other proposed hero frames

Not locked or ordered. These may be inserted, removed, or used to replace frames in the current spine.

| Proposed frame | Final hero composition | What it communicates | Exact product elements | Possible role |
|---|---|---|---|---|
| **Mastery** | A graded question set reaches its result state—score and explanation—surrounded by restrained celebratory motion. | Buddy turns understanding into demonstrated ability. | One question set on Bench, Practice selected, docked chat. A flashcard-review frame is an alternative, not something shown simultaneously. | Possible high-intensity climax |
| **Native Obsidian** | A destination note has just opened after following a wikilink. The Obsidian-marked notebook and selected destination file remain visible around the rendered note. | Buddy understands and navigates an existing Obsidian vault. | Obsidian-marked notebook in the left sidebar, minimal chat, destination Markdown note on Bench, Files drawer with the destination file selected | Distinctive interoperability frame; likely mid-arc |
| **Interactive artifact / game** | A learner’s decisive interaction pushes an immersive game or simulation into its most visually dramatic success or discovery state. Source capture: [game.mp4](file:///Users/prashantbhudwal/Code/buddies/demo-video/packages/videos/public/captures/game.mp4) (1920×1080, 60fps, 10.2s). | Buddy can create experiences that are playable, explorable, and responsive—not merely static answers. | One sandboxed HTML/canvas widget on immersive Bench, small secondary chat, sidebar and rail hidden | Hero climax / Peak frame asset ready |

## Probable final composition

Not locked. The ending should form an emotional echo of the interactive artifact/game peak—not become a text-heavy end card.

```text
PEAK
Interactive canvas/game reaches its spectacular success state
        ↓
AFTERSHOCK
Elements from that world transform into the mass-feature frame
        ↓
ERUPTION
Feature elements leave the screen
        ↓
IDENTIFICATION BEAT
“Buddy” and perhaps one short line appear briefly
        ↓
TEXT DISAPPEARS
Mascot enters the canvas world
        ↓
END
Mascot activates one final element, then dissolves into the world
Only the completed, gently moving canvas remains
```

### Literal final frame

- Full-bleed canvas/game world with no application chrome.
- One beautiful central system carried forward from the peak.
- The mascot performs one small action that completes or calms the world.
- The mascot dissolves into particles that become part of the canvas.
- Only the completed, gently moving visual world remains.
- No wordmark, URL, platform icons, or copy.

Free, macOS/Windows availability, provider compatibility, and the landing-page URL remain candidates for the launch post and landing page rather than the literal final frame.

## Candidate beat sheets

Not locked. Four compact narrative possibilities, each intentionally limited to four beats rather than every feature.

| Candidate | Beat 1 | Beat 2 | Beat 3 | Beat 4 | Character |
|---|---|---|---|---|---|
| **Creation crescendo** | **Command:** one ambitious prompt lands in chat. | **Creation:** a visual explanation assembles on docked Bench. | **Expansion:** the visual grows into a completed immersive whiteboard. | **Peak and end:** an interactive game reaches its spectacular state, becomes the mass-feature aftershock, then resolves into the completed canvas ending. | Continuous escalation from a small request to a living world |
| **Native knowledge** | **Recognition:** an Obsidian-marked notebook appears. | **Rendering:** one Markdown note opens beautifully on Bench. | **Navigation:** a wikilink is followed into a destination note. | **Resolution:** linked-note elements expand into a visual knowledge field before settling into a quiet mascot-assisted ending. | Distinctive, precise, and focused on existing knowledge |
| **Mastery** | **Challenge:** Buddy receives one difficult learning question. | **Understanding:** a concise visual explanation appears. | **Practice:** one question set is answered and submitted. | **Payoff:** the graded score and explanation arrive, followed by a restrained visual ending. | Compact arc from uncertainty to demonstrated ability |
| **Pure trailer montage** | **Arrival:** the Buddy desktop window enters with force. | **Hero barrage:** a few selected culmination frames hit rapidly—Obsidian, whiteboard, and interactive game. | **Mass frame:** capability tiles accumulate to maximum density. | **Eruption and end:** the field erupts, the mascot enters the canvas world, and only the completed world remains. | Minimal logic; maximum rhythm, breadth, and spectacle |
