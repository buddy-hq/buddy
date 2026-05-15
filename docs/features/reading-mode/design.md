# Reading Mode

## Objective
- make reading mode a first-class read-and-chat workspace for notebook resources, not just a document viewer bolted onto chat.

## Current Product Shape
- reading mode lives at `/$directory/read?path=...&resource=...`.
- it is a dedicated split-pane screen.
- the left pane is `DirectoryChatReadingReaderPane`, which loads a resource blob and renders `FoliateReader`.
- the right pane is the normal chat conversation pane with a reading-specific thread browser header.
- the main entrypoint is `openResourceInReadingMode` from the notebook UI.
- while the route is mounted, the selected session persona is switched to `buddy`.
- when the route unmounts, the page restores the prior persona selection for the affected session.
- every prompt sent from reading mode includes the `reading` payload (position, passage, trail, annotations) as primary grounding. Resource-reference auto-injection has been removed; the model grounds on local reading context first and uses resource pack reads only when broader scope is needed.
- the backend turns that request payload into `activeResource` prompt context and renders `<active_reading_resource>` into the prompt pipeline.

## Key Files
- route: `packages/web/src/routes/$directory.read.tsx`
- page shell: `packages/web/src/components/directory-chat/directory-chat-reading-page.tsx`
- reader pane: `packages/web/src/components/directory-chat/directory-chat-reading-reader-pane.tsx`
- thread browser: `packages/web/src/components/directory-chat/directory-chat-reading-thread-browser.tsx`
- reader implementation: `packages/web/src/components/readers/foliate-reader.tsx`
- reader persistence helpers: `packages/web/src/components/readers/utils/foliate-storage.ts`
- route controller entrypoint: `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`
- chat state: `packages/web/src/state/chat-store.ts`
- resource blob query: `packages/web/src/state/resources-query.ts`
- backend prompt context: `packages/buddy/src/learning/prompt/context.ts`
- active resource prompt block: `packages/buddy/src/learning/prompt/runtime-context/resource-context/active-resource-section.ts`

## End-To-End Flow
1. the user opens a PDF or EPUB resource.
2. `openResourceInReadingMode` prefetches notebook resources and, for supported files, prefetches the raw blob for the reader.
3. the app navigates to `/$directory/read` with the resource path and optional resource id in search params.
4. `DirectoryChatReadingPage` resolves the matching resource record, marks it as the active reading resource for the directory, and switches the current session to `buddy`.
5. `DirectoryChatReadingReaderPane` loads the blob through `readingResourceBlobQueryOptions` and passes it to `FoliateReader`.
6. `FoliateReader` opens the book, restores persisted reader state, and emits location updates.
7. those location updates are copied into `activeReadingResourceByDirectory`, so the current location, toc label, and page label are available to prompt submission.
8. `sendRuntimePrompt` attaches the `reading` payload with position, passage, trail, and annotation data. Resource references are only included when explicitly requested (e.g. via `/resource use`).
9. the backend parses that payload into `activeResource` and includes `<active_reading_resource>` in the prompt context for the turn.
10. after a prompt is sent, the session id is linked to the resource id in `linkedSessionByResource`.

## Verified Behavior
- last-location restore already exists in `FoliateReader`. it loads `persisted.lastLocation` from `loadBookState(...)` and passes it into `view.init(...)`.
- reader open and init failures are already caught inside `FoliateReader`, which renders `FoliateErrorState` instead of crashing on the normal async failure path.
- linked session restore is only partially implemented today. the code restores a linked session when reopening a resource outside the library-open flow, but opening from the library sidebar still starts a fresh draft first.

## Obvious Improvements

### 1. Reuse the linked reading session even when reopening from the library
- current behavior: `openResourceInReadingMode` restores `linkedSessionByResource[...]` only when the resource is opened outside the `libraryOpen` flow. if the user reopens the same resource from the library sidebar, Buddy creates a fresh draft session instead.
- why it matters: this breaks the strongest reading-mode mental model, which is that a book and its discussion thread belong together.
- likely change: prefer the linked session when one exists, even during the library-open path. only fall back to a new draft when the resource has no linked session yet.

### 2. Gate the reader on resource readiness before fetching the blob
- current behavior: the route loader and reader pane fetch the blob for any supported path, but the pane does not check the resource's processing status before trying to open it.
- why it matters: resources in `preparing` or `unprocessed` states can fall through to a generic loading or error path instead of showing a clear product state.
- likely change: resolve the matching `ResourceRecord` earlier and show explicit `preparing`, `not ready`, `unsupported`, or `error` states before the blob query runs.

### 3. Use a reading-specific cache policy for large blobs
- current behavior: `readingResourceBlobQueryOptions` uses the same `RESOURCE_COVER_STALE_TIME_MS` constant as resource covers, which is only five minutes.
- why it matters: reopening a large PDF or EPUB after a short idle period can trigger another expensive blob load even though the file is effectively immutable for the session.
- likely change: give reading blobs their own cache constant with a much longer `staleTime`, and consider an explicit `gcTime` tuned for large local files.

### 4. Remove the unused `foliate-reader-backup.tsx`
- current behavior: `packages/web/src/components/readers/foliate-reader-backup.tsx` is a very large unused file and there are no in-repo references to it.
- why it matters: it adds noise when navigating the reader code and makes it less clear which implementation is real.
- likely change: delete it if it is truly dead, or move it out of the main source tree if it still needs to be kept for reference.

### 5. Make the reading thread browser resource-aware
- current behavior: `DirectoryChatReadingThreadBrowser` receives the full notebook session list and does not distinguish sessions linked to the current resource.
- why it matters: once a notebook has many threads, reading mode loses the sense that the conversation history belongs to this book.
- likely change: filter the thread list to the linked resource sessions, or at minimum badge and sort resource-linked sessions ahead of unrelated threads.

### 6. Add a true cross-route resume-reading affordance
- current behavior: the active reading resource is cleared on reading-page unmount, so normal chat does not retain enough state to offer a reliable “resume reading” action.
- why it matters: moving between normal chat and reading mode feels more like leaving the feature than switching surfaces inside one workflow.
- likely change: persist a separate last-opened reading resource per directory and expose a small resume affordance from the normal chat surface.

## Deeper Context Gaps

### 7. Reading context drops machine-usable position data before it reaches chat
- current behavior: `FoliateReaderLocation` already contains `fraction`, `cfi`, and `index`, but `DirectoryChatReadingPage` only copies `locationLabel`, `tocLabel`, and `pageLabel` into `chat-store`.
- current behavior: the backend parser in `packages/buddy/src/learning/prompt/context.ts` also only reads the label-style fields, so even if the web app sent richer position data today, the prompt context would ignore it.
- why it matters: the agent cannot anchor itself to an exact place in the book, detect revisits, or map the current position to a prepared page/chunk with confidence.
- likely change: promote a real reading-position payload end to end, including at least `cfi`, `index`, `fraction`, and the human labels.

### 8. The agent does not receive the current visible passage
- current behavior: reading mode tells the agent which resource is open and roughly where the reader is, but not what text is actually on screen right now.
- current behavior: `resource-reference` expansion is still resource-level. it expands to the resource entrypoint and optional TOC, not the current passage, current chunk, or current page window.
- why it matters: close-reading questions are often really about the passage in front of the user, not the whole book. a state-of-the-art reading surface should make that local scope easy for the agent to use.
- likely change: add a bounded `current passage` context block. for PDF this can likely map to prepared page windows. for EPUB it may need a viewport-derived excerpt or a mapping from section/index/href into processed chunks.

### 9. There is no first-class selection-to-chat workflow
- current behavior: the reader selection toolbar only exposes `Copy`, `Highlight`, `Note`, and `Search` in `packages/web/src/components/readers/ui/foliate-selection-toolbar.tsx`.
- current behavior: the prompt part model only supports text, agent mentions, workspace-file references, resource references, and files. there is no `reading-selection` or `quoted-passage` part.
- why it matters: this is the most obvious missing interaction for a reader with an agent beside it. users should be able to select a passage, ask about it, and have that selection travel with the message in a structured way.
- likely change, v1: add a `Chat` action on the selection toolbar that inserts a quoted excerpt into the draft plus the current resource reference.
- likely change, proper end-state: add a first-class `reading-selection` prompt part carrying `text`, `cfi`, `index`, `tocLabel`, `pageLabel`, and `resourceKey`, and render it as a removable selection card above or inside the composer.

### 10. The system has no “seen so far” reading trail
- current behavior: there is no state that records which sections, chapters, or page windows the learner has already visited over the course of the session.
- current behavior: this is notable because the `reading` skill explicitly says to maintain awareness of what portion of the document has been seen so far.
- why it matters: without a reading trail, the agent cannot distinguish “we are still in chapter 1” from “the learner has already moved through five sections and came back here.”
- likely change: keep a bounded reading trail such as the last several distinct TOC items, page windows, or section indexes with timestamps and revisit counts.

### 11. Reader annotations are local UI state, not agent-visible reading state
- current behavior: highlights, notes, and bookmarks exist in `FoliateReader` and persist via browser local storage, but they are not included in prompt context.
- why it matters: highlights and notes are some of the strongest signals of what the learner found important or confusing. leaving them invisible to the agent wastes one of the best sources of authentic reading context.
- likely change: expose a lightweight annotations context to chat, such as recent highlights, the currently opened note, or an explicit “chat with this highlight” action.

### 12. Active reading context does not expose the prepared resource pack directly
- current behavior: the prompt’s active-reading block renders `id`, `alias`, `status`, `toc`, `page`, and `location`, but not direct pack pointers like entrypoint path, TOC path, full-text path, chunks path, or pages path.
- current behavior: some of this metadata already exists elsewhere in prompt context, but not in the active-reading block itself.
- why it matters: the current resource should be the easiest resource for the model to operate on. today, the model still has to infer or rediscover the prepared substrate when it wants to go beyond the current labels.
- likely change: enrich active-reading context with direct prepared-pack pointers, or add a specialized reading-context block that names the active resource’s processed files explicitly.

### 13. Reader state persistence is app-global, not notebook-aware
- current behavior: book progress, bookmarks, and annotations are persisted in browser local storage using a book-derived key from metadata and source name.
- why it matters: copies of the same book across notebooks, or different revisions with identical metadata, can end up sharing reader state unexpectedly.
- likely change: include notebook/resource identity in the persistence key when Buddy opens a notebook resource, while still letting plain standalone reader usage fall back to the current document-derived key.

### 14. The reading surface does not capture the learner’s reading goal
- current behavior: the chat pane is the normal generic prompt composer. it does not capture whether the learner is reading for comprehension, close reading, critique, study, exam prep, or discussion.
- why it matters: the `reading` skill is already designed around these modes, but the UI does not help the user express them. that makes the agent feel less intentional than the skill design suggests.
- likely change: add lightweight reading-mode goal chips or quick intents above the composer, such as `Understand`, `Analyze`, `Close read`, `Study`, and `Discuss`.

## Selection To Chat

### Minimum viable version
- add `Chat` to the selection toolbar.
- when chosen, seed the prompt draft with:
  - the current resource reference
  - a visible selection card or quoted passage
  - optional helper copy like `Explain this passage` only when the user has not typed anything yet
- keep the raw selected text attached to the message so the model can answer from the exact excerpt even before deeper reader integration lands.

### Proper long-term version
- add a first-class `reading-selection` prompt part on the web side.
- teach the backend prompt pipeline to preserve that part instead of flattening it into plain text too early.
- include structured metadata with the selection:
  - `resourceKey`
  - `text`
  - `cfi`
  - `index`
  - `tocLabel`
  - `pageLabel`
  - `locationLabel`
  - optional `pageStart` / `pageEnd` or processed chunk reference when resolvable
- render the selection as a removable chip/card above the prompt box so the user can see exactly what will be sent.

### Why this matters
- it matches the native behavior users expect from serious reading tools.
- it reduces ambiguity in close-reading questions.
- it creates a bridge between local reader interaction and agent grounding.
- it opens the door to multi-selection workflows later, such as compare-two-passages or build notes from selected excerpts.

## What Better Reading Context Could Be
- `current position`: exact machine-usable location plus human labels
- `current passage`: the visible excerpt or the current processed page/chunk window
- `active selection`: the user’s currently selected text with its location metadata
- `seen so far`: a bounded reading trail of visited sections/pages
- `recent annotations`: recent highlights, notes, and bookmarks
- `reading goal`: why the learner is reading right now
- `resource pack pointers`: direct paths to the active resource’s entrypoint, TOC, full text, chunks, and pages

This would let the agent answer very different questions well:
- whole-resource questions
- current-page questions
- selected-passage questions
- “what have I covered so far?” questions
- “turn my highlights into notes / quiz / flashcards” questions

## Authentic Reader Experience Opportunities

### Agent answers should point back into the reader
- current behavior: chat is not passage-addressable from the reader.
- likely change: let assistant responses include jump-back actions that reopen the cited section, page, or annotation.

### Highlights and notes should become part of the study loop
- current behavior: annotations are useful inside the reader but disconnected from chat workflows.
- likely change: support actions like `summarize my highlights`, `quiz me on my notes`, or `turn these annotations into flashcards`.

### The agent should be able to operate at the right scope automatically
- current behavior: the reading skill knows how to choose between full-text and scoped reading, but the UI does not help specify the local scope the user is looking at.
- likely change: if the user asks from a selection or current passage, prefer passage-level grounding; if the user asks about the book, let the runtime use full-text ingestion or broader pack context.

### The reading session should feel continuous, not reset-prone
- current behavior: route changes, library re-entry, and non-resource-scoped threads all weaken the feeling of one continuous reading session.
- likely change: unify session restore, resume reading, resource-scoped history, and visible reading trail so the user feels they are continuing a reading conversation, not starting random chats.

### Reading mode should expose one-step reading actions
- likely changes:
  - `Explain this page`
  - `Summarize this section`
  - `Quiz me on what I just read`
  - `Turn this highlight into a note`
  - `Compare this passage with another selection`

These are not just shortcuts. they make the product feel like a reading environment with an embedded guide.

## Non-Issues From Earlier Drafting
- restoring the last reading location is already implemented inside `FoliateReader`; it should not be treated as a missing feature.
- linked session restore is not entirely missing; it is partial and inconsistent.
- the async reader-open path already has in-component error handling, so “add an error fallback” is lower priority than the UX and state-flow issues above.

## Suggested Order
1. add a first-class selection-to-chat flow
2. expand reading context to include machine-usable position and current passage
3. make the system track “seen so far” and recent annotations
4. reuse linked sessions consistently and make thread history resource-aware
5. add jump-back citations and other passage-addressable chat interactions
6. add resume-reading affordance outside the route
7. gate reader loading on resource readiness
8. tune blob caching for large reading files
9. make reader persistence notebook-aware
10. remove the dead backup file

## Explicit End State

Reading mode is done when Buddy behaves like a real reading workspace with an embedded agent, not just a reader next to chat.

### Product end state
- opening a notebook resource returns the learner to the same reading conversation for that resource unless they explicitly start a new one
- the reader can send three scopes of context to the agent:
  - whole resource
  - current passage
  - explicit user selection
- selecting text in the reader exposes a `Chat` action that creates a visible selection card in the composer and sends structured selection metadata with the prompt
- the agent receives machine-usable reading position data, not just labels
- the agent can see a bounded reading trail of what the learner has covered so far
- the agent can use recent highlights and notes as reading context when helpful
- assistant responses can point the learner back to specific places in the reader
- reading mode preserves continuity across route changes, library re-entry, and notebook sessions

### Technical end state
- the web app carries an explicit reading context model from `FoliateReader` through prompt submission
- prompt submission supports a first-class `reading-selection` part instead of flattening selections into plain text only
- backend prompt context understands:
  - active reading position
  - active selection
  - current passage
  - recent reading trail
  - recent annotations summary
- active resource context includes direct prepared-resource pack pointers for the active resource
- reader persistence keys are notebook-aware for notebook resources
- all reading-mode state transitions are test-covered where logic is non-trivial

## Concrete Implementation Plan

### Phase 1. Selection-to-chat MVP

> **Status: Implemented**

#### Goal
- let the user select text in the reader, click `Chat`, and immediately ask about that passage from the side chat.

#### End state
- the selection toolbar shows `Chat`
- clicking `Chat` inserts a visible selection payload into the current prompt draft
- the draft includes the current resource reference automatically
- sending the prompt carries the selected text with enough metadata to identify where it came from

#### Web changes
- update `packages/web/src/components/readers/ui/foliate-selection-toolbar.tsx`
  - add a `Chat` action next to `Copy`, `Highlight`, `Note`, and `Search`
- update `packages/web/src/components/readers/foliate-reader-types.ts`
  - add a typed payload for a reader selection event that includes at least `text`, `cfi`, `index`, `tocLabel`, `pageLabel`, and `locationLabel`
- update `packages/web/src/components/readers/foliate-reader.tsx`
  - expose `onChatSelection` callback from the reader
  - on selection toolbar `Chat`, pass the current selection payload upward instead of only keeping it local
- update `packages/web/src/components/directory-chat/directory-chat-reading-reader-pane.tsx`
  - accept a callback for chat selection and forward it to `FoliateReader`
- update `packages/web/src/components/directory-chat/directory-chat-reading-page.tsx`
  - wire reader `onChatSelection` into prompt drafting
  - use the existing prompt draft path via `cs.setPromptDraft(...)` from the notebook route controller context

#### Prompt model changes
- update `packages/web/src/components/prompt/prompt-types.ts`
  - add `READING_SELECTION_PART_TYPE`
  - define `PromptReadingSelectionPart`
  - include it in `PromptComposerPart` and `PromptSubmissionPart`
- update `packages/web/src/components/prompt/prompt-parts.ts`
  - clone, serialize, collect, and render the new part type
  - render it as a removable selection card, not as plain inline text
- update `packages/web/src/state/prompt-store.ts`
  - validate and persist the new prompt part type safely
- update `packages/web/src/lib/directory-chat/chat-prompt-helpers.ts`
  - preserve the new part during submission building

#### Backend changes
- update `packages/buddy/src/routes/session.ts`
  - no schema restriction is needed beyond passthrough, but document the new part shape in route-local comments if useful
- update `packages/buddy/src/learning/prompt/workspace-file-references.ts`
  - preserve `reading-selection` parts during prompt normalization rather than dropping or flattening them accidentally
- update prompt/message handling code so `reading-selection` survives into the transformed parts list

#### Acceptance criteria
- selecting text in the reader and clicking `Chat` adds a visible selection card to the composer
- the message still includes the current resource reference
- the selected text is sent without losing its reading metadata
- existing copy/highlight/note/search behaviors still work

### Phase 2. Rich active reading context

> **Status: Implemented**

#### Goal
- stop reducing reading context to only human-readable labels

#### End state
- active reading context includes exact position metadata and current local scope
- backend prompt context can reason about the reader’s exact place in the document

#### Web changes
- update `packages/web/src/state/chat-store.ts`
  - expand `ActiveReadingResourceState` to include `cfi`, `index`, and `fraction`
  - add optional `currentPassage` and `selection` fields only if the shape remains manageable
- update `packages/web/src/components/directory-chat/directory-chat-reading-page.tsx`
  - persist the richer location payload from `FoliateReader`
- update `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`
  - include the richer fields in the `reading` payload passed to `sendPrompt(...)`

#### Backend changes
- update `packages/buddy/src/learning/prompt/context.ts`
  - extend `ActiveReadingContext` and `ActivePromptResource`
  - parse and preserve `cfi`, `index`, `fraction`, and any bounded passage payload
- update `packages/buddy/src/learning/prompt/runtime-context/resource-context/active-resource-section.ts`
  - render the richer fields into prompt context in a compact but explicit format
- update `packages/buddy/src/learning/prompt/runtime-context/resource-context/active-resource-context.t.md`
  - revise the prompt block wording if needed so the new fields read clearly

#### Acceptance criteria
- the active-reading prompt block includes exact position fields in addition to labels
- the prompt context stays concise and does not dump unbounded text by default
- existing prompt compilation still works for sessions without reading mode

### Phase 3. Current passage grounding

> **Status: Implemented**

#### Goal
- give the agent access to the text the learner is actually looking at now

#### End state
- reading mode sends a bounded `current passage` context block when available
- the block is small, explicit, and local to the current reading position

#### Design direction
- PDF path:
  - prefer mapping the current position to prepared page markdown or page-window chunks
- EPUB path:
  - either derive a viewport excerpt directly from Foliate
  - or map current section/index/href into processed chunk files if a reliable mapping is available

#### Changes
- web:
  - capture a bounded visible excerpt or a resolvable current-scope key from `FoliateReader`
- backend:
  - extend active reading context or add a separate `current passage` prompt block
  - keep the payload bounded and predictable

#### Acceptance criteria
- close-reading prompts can include the current passage without requiring manual selection
- whole-book prompts still rely on resource-level grounding and full-text ingestion when appropriate

### Phase 4. Reading trail and annotation-aware context

> **Status: Implemented** (reading trail + annotation summary; full annotation store sync deferred)

#### Goal
- make the agent aware of what the learner has already covered and marked as important

#### End state
- a bounded reading trail exists per reading session/resource
- recent highlights and notes can be included in prompt context or explicitly attached through UI actions

#### Web changes
- update `packages/web/src/state/chat-store.ts`
  - add a compact reading trail structure keyed by directory/resource
  - add recent-annotation summary state or derived selectors as needed
- update `packages/web/src/components/directory-chat/directory-chat-reading-page.tsx`
  - append new trail entries when the user crosses into a new TOC item, section index, or page window
- update `packages/web/src/components/readers/foliate-reader.tsx`
  - expose annotation events if needed for upstream state sync

#### Backend changes
- update `packages/buddy/src/learning/prompt/context.ts`
  - parse and expose bounded trail/annotation payloads
- update prompt runtime sections to render this context compactly

#### Acceptance criteria
- the agent can distinguish current location from prior covered sections
- highlights/notes can influence study help without dumping the full annotation store into every prompt

### Phase 5. Reading continuity and resource-scoped history

> **Status: Implemented** (linked session restore, resource-aware thread browser, resume-reading state; full annotation store sync deferred)

#### Goal
- make the reading experience feel continuous across navigation and re-entry

#### End state
- reopening a resource from the library restores the linked thread by default
- reading thread history is resource-aware
- normal chat can offer `Resume reading`

#### Changes
- update `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`
  - always prefer linked reading session restore when available
- update `packages/web/src/components/directory-chat/directory-chat-reading-thread-browser.tsx`
  - filter, badge, or sort sessions by current resource linkage
- update reading resource persistence in `chat-store` to retain last-opened resource per directory outside the route lifecycle

#### Acceptance criteria
- reopening the same resource returns the learner to the same discussion thread unless they explicitly create a new one
- thread history clearly communicates which sessions belong to the current book
- leaving reading mode does not sever the reading workflow

### Phase 6. Jump-back citations and authentic reading actions

#### Goal
- make chat outputs actionable inside the reader itself

#### End state
- assistant replies can contain jump-back links or actions to open a cited passage, page, or annotation
- reading mode exposes one-step actions such as `Explain this page` and `Quiz me on what I just read`

#### Changes
- define a minimal citation payload that can reopen a reader location
- add UI affordances in chat rendering to trigger reader navigation
- add reading quick actions near the composer and/or selection toolbar

#### Acceptance criteria
- the learner can navigate from an assistant citation back into the reader in one step
- quick actions feel like reading workflows, not generic chat shortcuts

## Cross-Cutting Implementation Notes
- prefer adding one new explicit reading part type over encoding selections as ad hoc text prefixes
- keep prompt context bounded; do not silently attach huge excerpts on every turn
- prefer exact location metadata plus small local excerpts over vague labels alone
- reuse Buddy’s prepared resource-pack substrate whenever possible, especially for page-window and chunk mapping
- preserve the normal reading skill behavior for whole-resource grounding; these UI improvements should complement that workflow, not replace it
- avoid coupling reader-only UI state directly to backend assumptions unless the state has a typed prompt contract

## Testing And Verification Plan
- `packages/web` tests
  - prompt part parsing/rendering for `reading-selection`
  - prompt-store validation and persistence for the new part type
  - reading page/controller behavior for drafting a chat selection
  - linked-session restore behavior from library open flow
- `packages/buddy` tests
  - prompt context parsing for expanded `reading` payloads
  - prompt pipeline preservation of `reading-selection`
  - runtime section rendering for richer active-reading context
- required verification before task completion
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`

## Recommended First Build Slice
- implement Phase 1 and the minimal data portion of Phase 2 together:
  - `Chat` on selection toolbar
  - first-class `reading-selection` prompt part
  - resource reference only attached on explicit request (not auto-injected every turn)
  - richer active reading position fields: `cfi`, `index`, `fraction`

That slice creates the biggest improvement in felt product quality while also establishing the data contracts needed for everything else.

## Implementation Status

### Implemented
- **Phase 1**: Selection-to-chat MVP (`Chat` on toolbar, `reading-selection` part, selection card in composer, metadata-backed flattening)
- **Phase 2**: Rich active reading context (`cfi`, `index`, `fraction`, `currentPassageText` in prompt)
- **Phase 3**: Current passage grounding (bounded excerpt from Foliate `relocate.range`, capped at 1200 chars, live-only)
- **Phase 4**: Reading trail (up to 20 TOC sections) + annotation summary (last 10 highlights with notes)
- **Phase 5**: Linked session restore from library, resource-aware thread browser with `Current book` badge, `lastOpenedReadingResourceByDirectory` persistence, "Resume reading" affordance in resource grid
- **Item 2**: Reader loading gated on resource readiness (preparing/unsupported/error states)
- **Item 3**: Reading blob caching at 30min staleTime (was 5min)
- **Item 4**: Removed dead `foliate-reader-backup.tsx`
- **Item 13**: Notebook-aware reader persistence via `notebook:{resourceID}` suffix in book keys

### Remaining
- **Phase 6**: Jump-back citations and quick reading actions (Explain this page, Quiz me, etc.)
- **Item 1**: Already done (linked session restore in Phase 5)
- Full annotation store sync into prompt (current summary is derived from onAnnotationsChange callback)
