# Educator Mockup Storyflow Design (Slides & Composer Chip Refined)

This document outlines the step-by-step choreographical flow of the Educator (Teacher) mockup workspace `/teachers` in a clear, timeline-based sequence.

---

## Story Timeline Sequence

### Phase 1: Idle Initialization
1. **Initial Screen State**:
   - The chat feed is completely empty.
   - The Bench (right pane) is collapsed (`right-pane-collapsed` class is active on the workspace body).
   - The Action Sidebar has the **Library** rail button active.
   - The Editor tab in the background contains the drafting placeholder (`"No active session..."`).

---

### Phase 2: User Request (Create Task)
2. **User Input Simulation**:
   - The chat input simulates typing: `"I have a Grade 8 seasons activity. Write one short editable Markdown document in the Bench with three versions of the same task: support, on-level, and extension. Keep it to one page."`
   - A simulated click pulse happens on the submit button.
   - The user message is appended to the chat feed.
   - The input is cleared.

3. **Tool Launching (Draft Lesson Plan)**:
   - A typing indicator appears briefly (stretching from `250ms` to `400ms`).
   - Typing indicator is removed.
   - A tool row is appended inside a `.tool-group` container:
     - Icon: Document file icon.
     - Action: `Draft Lesson Plan` (shimmers with `.running` class).
     - Subject: `Creating seasons-outline.md` (hidden: `opacity: 0`).
   - **The Bench remains collapsed** while the tool is actively working in the chat feed.

4. **Draft Resolution & Bench Editor Open**:
   - The shimmer runs for `1200ms`.
   - Once complete:
     - The `.running` class is removed from the tool action (stops shimmering).
     - The `.tool-subject` receives the `.visible` class (slides up and fades in).
     - **The Bench Slides Open**:
       - The active action tab switches to **Editor**.
       - The Bench expands (removes `right-pane-collapsed` class).
       - The active session header title is updated to `seasons-outline.md`.
     - **Editor Content Appears**:
       - The placeholder is replaced with the Grade 8 Seasons Differentiated Task content (support, on-level, and extension sections).
       - The editor status badge shows `Saved`.
   - A brief delay of `400ms` occurs to let the panel transition settle.

5. **Assistant Response Typing**:
   - A typing indicator appears in the chat.
   - The typing indicator is removed after `400ms`.
   - A chat bubble is appended.
   - The assistant types out the response character-by-character: `"I've initialized the Grade 8 Seasons Differentiated Task worksheet in your editor. Let's design the sections."`
   - Wait for `500ms` before advancing.

---

### Phase 3: Misconception Rewrite Request
6. **User Input Simulation**:
   - User types: `"Can you change the extension task to focus on debunking the distance misconception?"`
   - Simulated click on submit button.
   - User message is appended.

7. **Native Focus Highlight & Composer Chip**:
   - A typing indicator appears in the chat.
   - **Editor-Native Highlight Zone**:
     - Section 3 in the editor receives a glowing outline/focus highlight (representing the AI focus).
     - The highlight pulses to indicate the text is selected for modification.
   - **Composer Context Chip**:
     - A chip slides in above the composer textarea: `Selected: "Section 3: Extension Level"`.
   - The typing indicator is removed.

8. **Section Rewrite & Response**:
   - A new assistant chat bubble is appended.
   - The assistant types the response: `"Sure! I've selected section 3 and rewritten it to debunk the misconception using aphelion and perihelion data. Let me know if the wording looks good."`
   - **Editor Content Update (Sequential Resolution)**:
     - As soon as the typing completes:
       - Section 3's text content is replaced with the aphelion/perihelion text.
       - The editor status changes to `Saving...`.
       - After `800ms`:
         - The editor status transitions back to `Saved`.
         - The selection highlight (`ai-focus-highlight`) fades away.
         - The composer chip (`#chat-selection-chip`) fades out/disappears.

---

### Phase 4: Multiple Standards Alignment
9. **User Input Simulation**:
   - User types: `"Align this to standards."`
   - Submit button is clicked, user message is appended.

10. **Parallel Search Execution (Concurrent Shimmers)**:
    - A new `.tool-group` container is appended to the chat.
    - Three tool rows enter sequentially (staggered by `150ms`):
      1. `Search NGSS Standards` -> `Found MS-ESS1-1`
      2. `Search CCSS Standards` -> `Found RST.6-8.7`
      3. `Search NCERT Syllabus` -> `Found Grade 8 Astronomy`
    - **All three row actions shimmer concurrently** (`running` class is active).
    - After `1200ms`, the tools resolve one-by-one in a staggered sequence (staggered by `250ms`):
      - Shimmer is removed, and the resolved count/details slide in.
    - **Visual Standards Alignment Banner**:
      - Inside the editor Bench, a dedicated standards banner appears at the top containing three interactive badge/chips (`NGSS MS-ESS1-1`, `CCSS RST.6-8.7`, `NCERT G8`), keeping the student-facing worksheet content clean.
      - The editor status header updates to: `Aligned`.

11. **Assistant Response**:
    - Typing indicator appears and is removed.
    - Chat bubble is appended.
    - Assistant types: `"Done. I've aligned the worksheet sections to standard criteria at multiple levels..."` (listing the standards as bullet points in the chat).

---

### Phase 5: Presentation Slides Generation (Show Presentation in Bench)
12. **User Input Simulation**:
    - User types: `"Looks great, generate a presentation slide deck for this."`
    - User message is appended.

13. **Presentation slide deck Generation**:
    - A new `.tool-group` container is appended.
    - A tool row is added:
      - Icon: Document/slides icon.
      - Action: `Create Presentation` (shimmers).
      - Subject: `seasons-presentation.pptx`.
    - After `1200ms`:
      - Tool row resolves (shimmer stops, subject slides in).
      - The **Bench swaps to Slideshow Viewer Mode**:
        - The editor filename changes to `seasons-presentation.pptx`.
        - The editor status badge shows `View Only`.
        - The edit toolbar is hidden.
        - The paper workspace is replaced by an interactive **Slide Deck Viewer**:
          - Displays Slide 1 of 2: Title slide with clean card styling: `"Differentiated Activity: Seasons (Grade 8)"`.
          - Next/Prev buttons let the user toggle slides.
          - Toggling to Slide 2 shows the differentiated levels outline: support, core, and challenge.
      - A green toast notification slides in at the bottom: `"Presentation slides created and loaded in the Bench."`

14. **Assistant Response**:
    - Assistant types: `"I've generated the presentation slide deck for your seasons activity. You can preview the slides directly in your Bench."`
    - The simulation rests with the slideshow active in the Bench.
