# Buddy Onboarding — Design Direction

> Early-phase direction. No concrete values, no implementation detail.
> The goal is to align on feeling and intent before any pixel or code decision.

---

## The problem

A user downloads Buddy from the landing page — sold on warmth, agency, and a learning companion that lives on their computer. They launch the app and land on a bare screen that says "Select AI Engine." The tone drops. The promise disappears. The first impression of the product is a configuration form.

The onboarding works. It gets you connected. But it doesn't feel like the product you just signed up for.

## Why it matters

Onboarding is the one moment where the product's promise meets the product itself. If that moment feels like a different product — colder, more functional, less intentional — the user's excitement from the landing page leaks out. First impressions compound. A user who feels underwhelmed at launch is less likely to explore, less likely to come back, and less likely to tell someone.

## Hypothesis

We believe that making onboarding feel like a continuation of the landing page — same warmth, same audience-awareness, same sense of a companion rather than a tool — will produce higher completion rates and stronger early engagement, because the user will feel they've arrived somewhere intentional rather than somewhere they need to configure.

## What the landing page establishes

The landing page sets a clear emotional register:

- **Warm and second-person.** "A learning buddy that lives on your computer." Not "Buddy is an AI-powered learning platform."
- **Audience-aware.** The entire page swaps between learners and educators. The user sees themselves reflected.
- **Benefit-driven, not feature-listed.** Read, Play, Draw, Quiz, Remember — framed as things you *do*, not checkboxes.
- **Trust through simplicity.** No account, on device, asks permission. Stated plainly, not preached.
- **A companion, not a tool.** The word "buddy" carries weight. The product has personality.

## What the current onboarding does

It gets you connected to an AI engine and asks where to store your files. That's it. The steps are correct for function — you do need an engine and a folder — but they're presented as a form to fill out, not a welcome into a product.

The personalization step at the end (name, occupation, about you) is the closest thing to warmth, but it arrives too late and feels like an afterthought — three text fields with no framing.

## Options

Three approaches, ranging from conservative to bold. Each is a legitimate direction — the choice is about how much of Buddy's "getting to know you" we want to happen in screens versus in conversation.

### Option A — Minimal screens, chat does the rest

The shortest screen flow of any reference in this doc. Screens handle only what *must* exist before a chat can run: pick an AI engine, confirm a storage folder. Two steps, no welcome screen, no audience screen, no personalization screen. The moment the user lands in chat, Buddy's first message *is* the welcome and the personalization — as a real conversation. "Hey, I'm Buddy. Before we dive in — are you here to learn something, or teach something? And what should I call you?"

The audience choice, the name, the context — all collected in one natural conversational turn instead of three screens. And because it's in chat, the agent can immediately *act* on the answer in the same breath: "Got it, since you're studying for the bar exam, want me to set up flashcards or just start reading?" The tailoring is proved live, in the same interaction, instead of being a promise paid off screens later.

This is the most on-brand option for a product named "buddy." A companion introduces itself by talking to you, not by handing you a clipboard. It's also the one move none of the references could make — Linear, Raycast, and Arc all had to build screens because they don't have a conversational surface. Buddy does.

**Risk:** The first chat message carries a lot of weight. If it's poorly written or feels like a scripted bot, the warmth backfires. It also assumes the chat interface is good enough to *be* the welcome moment — if the empty chat state feels cold, we've removed the screens that would have warmed it up.

### Option B — The four-screen flow

Welcome → Audience → Connect AI → Personalize. Each screen asks one thing, advances with one action. This is the conservative option — it's structurally similar to the current flow but with better framing, an audience step, and warmer copy.

This is safe and shippable. It improves the current experience without rethinking the paradigm. The welcome screen bridges from the landing. The audience screen mirrors the landing's toggle. The connect step folds storage into a footnote. The personalize step is framed as "tell your buddy about yourself" instead of a profile form.

**Risk:** It's an improvement, not a bet. It adds two screens (welcome, audience) to solve a tone problem that might be solvable with zero screens. The welcome screen in particular asks for a tap without giving anything back — Linear and Raycast don't have standalone welcome screens because their first functional screen already sets tone in under 3 seconds. We'd be adding a gate that the references suggest we don't need.

### Option C — Cuts-based minimalism

No welcome screen. No audience screen (let occupation infer it, as the current flow already does). Keep only: Connect AI (with storage as a footnote) → Personalize. Two steps, same count as today, but with better framing and one key change: the personalization step's payoff is immediate. The first chat message references what the user typed — "Hey [name], ready to [their goal]?" — so the personalization feels real, not just saved.

This is the "fix what's broken, don't add" option. It treats the current flow as structurally correct and focuses all the design budget on the two moments that matter: the connect step's tone and the personalize step's payoff. The mascot, if used, appears once — in the personalize step or the first chat greeting — not scattered.

**Risk:** It doesn't deliver the audience-awareness that makes the landing distinctive. A learner and an educator get the same experience. If audience tailoring is a core part of Buddy's identity, this option sidesteps it entirely.

## Recommendation

**Option A.** Not because it's clever, but because it uses the one asset none of the references have.

Buddy has a structural advantage: no account, no signup, nothing to create. Arc's warmth costs 2.5 minutes and an account. Linear's efficiency costs 60 seconds and a workspace. Buddy could theoretically beat both because it has one less category of friction entirely. That's a genuine superpower, and a four-screen flow is at risk of throwing it away by adding steps in the name of warmth without questioning whether each one earns its place.

Buddy also has a conversational surface. Linear, Raycast, and Arc all had to build screen-based onboarding because they don't have chat. Buddy shipping a screen wizard when it has a chat model sitting right there is leaving its best asset on the table. The word "buddy" implies a relationship, and relationships start with a conversation, not a form.

The strongest version of Option A collapses everything except the two truly functional steps (connect AI, storage location) into the first conversation turn. This does in one natural exchange what four screens were going to do, and it proves the tailoring is real in the same interaction — not as a promise paid off three screens later.

**If Option A is too big a swing right now**, Option C is the fallback I'd push for — not Option B. Option B adds screens to solve a tone problem; Option C fixes the tone with the screens that already exist and spends the design budget on the one moment that actually matters (the personalization payoff). Option B is the safe choice, but "safe" here means "we improved the form" rather than "we bet on what makes Buddy different."

The one thing I'd hold firm on regardless of option: **the personalization step and the first chat message must be connected.** Right now they're disconnected — the user fills out a form, then lands in chat with a generic greeting. Connecting them costs nothing extra to build (the data's already saved) and is worth more than any copy polish. That callback is what makes Arc's membership card land — the payoff comes right after, not just "thanks, saved."

## What we're avoiding

- **Setup wizards.** Multi-step forms with progress bars that feel like installing printer drivers. The stepper can stay as a subtle indicator, but the *feeling* should be conversational, not bureaucratic.
- **Product tours.** We are not walking the user through features. Onboarding gets you to a working app — the product itself is the tour.
- **Repeating the landing's trust pitch.** The user already bought in. Onboarding doesn't need to re-sell "no account, on device." It can embody those values quietly without restating them.
- **Over-explaining BYO AI.** The landing shows four provider options. Onboarding shows two (ChatGPT, Free). That gap is fine — onboarding is the fastest path to working, not the full menu. "You can change this anytime" bridges it.
- **Mascots and decoration for their own sake.** The landing has mascot assets. They might belong in the welcome moment, but only if they earn their place. Decoration that doesn't serve the emotional register is noise.

## References

Research into three products that are often cited for onboarding craft. Below is what they actually do, not vibes.

### Linear (~60 seconds, 7 steps)

Linear's flow (per candu.ai teardown and pageflows recording):
1. Welcome — "Welcome to Linear" + Continue
2. Theme — light or dark mode picker
3. Team name — single text field
4. Import — GitHub, Jira, or "I'll do this later"
5. Invite — email field or "Skip for now"
6. Notifications — Slack/email or skip
7. First issue — cursor blinking, ready to work

**What's notable:**
- Theme selection comes immediately after welcome — cosmetic, but it's the first moment the product configures itself to you rather than the other way around. The sequencing makes a trivial choice feel meaningful.
- The command menu (Cmd+K) is introduced *before* the user has done anything. Most products save shortcuts for power users. Linear makes it the first thing you learn, signaling who the product is built for.
- Every integration step (GitHub, invites, notifications) is skippable. Nothing blocks the path to the first issue.
- After onboarding, a "get familiar with Linear" checklist teaches through action — create an issue, use the command menu, set a priority — rather than a tour or feature modal. You learn by doing the core workflow, not by reading about it.
- The whole thing takes about a minute. The activation event is "first issue completed and resolved," not "onboarding finished."

**Takeaway for Buddy:** Linear teaches through action, not explanation. The setup is fast because each step asks for one thing. The product doesn't feel the need to justify itself — it trusts you're already there. But Linear is a tool, not a companion. It can get away with "configure and go" because its personality is efficiency. Buddy's personality is warmth.

### Raycast (~5 steps, then an optional walkthrough)

Raycast's first-run flow (per manual.raycast.com and mvolkmann blog):
1. Begin setup — single button
2. Enable/disable built-in extensions — toggle switches, then Continue
3. Choose hotkey — the global shortcut to launch Raycast (default: Alt+Space, can claim Cmd+Space from Spotlight)
4. Email (optional) — enter email or skip
5. Launch Raycast — you're in the root search
6. Optional: "Start supercharging your productivity" — a walkthrough command that teaches features one at a time (calculator, calendar, window management, hotkeys)

**What's notable:**
- The hotkey is the real activation. Raycast's entire value is "summon me from anywhere." The onboarding makes you set that hotkey before you've used the product, so the first time you need it, the muscle memory is already there.
- Extensions are toggled upfront, not discovered later. This is a configuration step, but it's framed as "choose what you want" rather than "configure your settings."
- The walkthrough is optional and happens *after* you're already in the product. It's a command you can run, not a forced sequence. If you're the type who wants to explore, it's there. If you're not, you're never forced through it.
- There's almost no personality in the setup itself. The personality lives in the product. Raycast's onboarding is confident to the point of being terse — it assumes you know why you're here.

**Takeaway for Buddy:** Raycast shows that you don't need personality *in the onboarding* if the product has personality *after* it. But this only works if the product's personality is immediately obvious on first use. Buddy's chat interface is warm, but the user has to start a conversation to feel it. A welcome moment in onboarding could bridge that gap — giving warmth before the user has to earn it by typing.

### Arc (~2.5 minutes, ~10 steps, personality-forward)

Arc's unboxing (per Inverse interview with Browser Company designers, howtogeek, medium teardown, pageflows recording):
1. Splash screen — "Meet the internet again" (90s-style, lush colors)
2. Sign up — account creation (required for sync)
3. Welcome — after account, a warm welcome screen
4. Import data — bookmarks from Chrome/Safari/Firefox, or "do this later"
5. Pick color — choose accent color, with live preview; intensity, saturation, light/dark all adjustable. Color is tied to Spaces (Arc's tab organization system), so this choice is functional, not just cosmetic.
6. Select favorites — pick web apps you use (Gmail, Notion, etc.), sign into them, they get pinned
7. Connect integration — optional
8. Enable ad blocker — yes/no
9. Set as default browser — yes/no
10. Membership card — personalized card with your name, a random title ("Melodic Wizard"), the date, "Arc" branding. Shareable.

**What's notable:**
- The Browser Company explicitly designed this as an "unboxing experience." Designer Karla Cole: "Like when you pull the ribbon on a gift and that new shoe smell hits you in the face." They wanted the first opening to be special — not a minimalist setup window.
- Color is the first sensation. Not in stasis — animated, alive. The color picker isn't "light or dark" (Linear), it's a full hue/saturation/intensity playground. This is because color is functional in Arc (it organizes Spaces), but it also sets an emotional register: this browser is *yours*.
- The membership card at the end is pure personality. It has no functional purpose. It exists to make you feel like you joined something. The randomize button on the title ("Melodic Wizard") is playful and gives the user a small moment of delight at the finish line.
- Every functional step (import, ad blocker, default browser) is skippable. The non-skippable steps (account, color) are the ones that make Arc *feel* like Arc.
- The setup is longer than Linear's (~2.5 min vs ~1 min) and asks more of the user, but it doesn't feel like work because the personality carries it. The designers acknowledged this is like "hopping on a motorcycle after riding a manual bike" — Arc is different enough that some orientation is necessary, and they chose to make that orientation feel like a gift, not a manual.

**Takeaway for Buddy:** Arc is the closest reference for what Buddy is trying to do. Arc's unboxing proves that a setup flow can have personality without being a toy, and can ask meaningful questions (color = Spaces, favorites = pinned apps) while still feeling like an experience rather than a form. The membership card is a reminder that the *last* moment of onboarding matters as much as the first — it's the emotional close. Buddy's personalization step could serve this role if it's framed as "introduce yourself to your buddy" rather than "fill out your profile."

### What the three share

- **Every integration/config step is skippable.** None of them gate the core experience behind setup choices. (Buddy already does this with personalization — good.)
- **The activation event is in the product, not the onboarding.** Linear's is "first issue resolved." Raycast's is "use the hotkey." Arc's is "open your first tab in a Space." Onboarding gets you to the starting line; the product does the rest.
- **They trust the user.** None of these flows over-explain why the product exists or what it does. They assume you downloaded it for a reason and get you to value fast.
- **Personality is a choice, not a default.** Linear is terse. Raycast is invisible. Arc is lavish. Each matches the product's identity. Buddy's onboarding should match Buddy's identity — warm, companionable, a little personal — not copy any of these three registers directly.

## Open questions

1. **Which option are we betting on?** This is the decision the doc is asking for. Options A, B, and C are all defensible; the recommendation is A with C as fallback. The choice determines everything downstream.

2. **If Option A: is the chat surface ready to be the welcome?** The first chat message would carry the entire emotional weight that a welcome screen would in Option B. We need to look at the current empty-chat state and first-message rendering to judge whether it's warm enough to anchor the experience, or whether it needs design work first.

3. **If Option A: how does the first conversation collect structured data?** Audience and name need to persist somewhere the agent can read. Is this a special first-turn flow that writes to config mid-conversation, or does the agent ask and then we parse the response? This is a feasibility question, not a design one — but it gates whether Option A is buildable.

4. **Mascot placement.** Regardless of option, the mascot (if used) should appear once, at the single moment of highest emotional value — either a welcome screen (Option B), the first chat greeting (Option A/C), or the personalize step (Option C). Not scattered. This is a tone call better resolved with a mockup.

5. **Does the audience choice need to persist?** Under Option A, the agent learns the audience in conversation and acts on it immediately — it may not need to persist at all if the agent's behavior in that session is enough. Under Option B/C, if we keep audience as a screen, it should persist and change something real (suggested first actions, empty states). Shallow tailoring (subtext only) isn't worth building.

## What's next

This document presents options and a recommendation, not a locked direction. The next step is to pick an option. Then:

- If Option A: a feasibility check on whether the chat surface can carry the welcome moment, and whether structured data (audience, name) can be collected mid-conversation. Then a mockup of the first chat turn.
- If Option B or C: a mockup of the screen flow, so we can disagree about specifics rather than abstractions.

Only after the option is chosen and the mockup approved do we freeze concrete values and write the spec.
