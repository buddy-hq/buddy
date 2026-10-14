Create or continue a directory whiteboard object with a compact Excalidraw drawing program. Use `objectAction: "create"` and omit `objectID` to create a distinct whiteboard; give it a short semantic `title` so it is identifiable in Bench tabs and the Library. To continue or revise an existing whiteboard, use `objectAction: "update"` with its stable `objectID`; the same object can be used from any chat. Omit `title` on an edit to preserve the existing title, or provide it only when the board should be renamed.

Choose a whiteboard when an explanation should be built in front of the user or kept as a working record they return to:

- the structure is new to the user and seeing it assembled piece by piece, as you explain each part, is what makes it understandable;
- the picture will be extended or revised across turns, so follow-up questions add to the same board instead of starting over;
- position carries meaning and needs deliberate layout, such as components inside a system boundary, stages that change size or shape, or ideas arranged by relationship;
- the explanation mixes notations that fit no single diagram grammar, such as sketches, labels, arrows, equations, and annotations together;
- the user asks for a whiteboard, or you are working through something together that they may annotate or rearrange.

For example: work through a multi-step derivation while keeping earlier steps visible; build a causal chain or feedback loop one link at a time; lay out a system's parts as each role is explained; put two competing models side by side and mark where they diverge; repair a misconception on an existing sketch; grow a timeline around fixed anchors; leave one step unfinished for the user to predict.

A finished diagram that is read once works better inline: Mermaid when only connections or order matter, a figure when position or exact geometry matters. Use the calculator for data and plotted functions, and an HTML widget when the user should manipulate something. A generic request to explain or draw is not by itself a reason to open a board.

The board opens as a Bench tab and takes focus the first time it is drawn in a message. It becomes the home tab for that line of work, so continue an existing board when the user is working on it. Load the `whiteboard-authoring` skill before the first `whiteboard_create_view` call.

Set `boardAction` to `continue_current_board` for the first board, normal appends, repairs, local edits, delete/translate operations, new zones below or beside existing work, and anything that should preserve existing content or learner edits. Set `boardAction` to `destructively_replace_current_board` only when the user explicitly asks to discard, clear, overwrite, or replace the entire current board. Replacement destructively overwrites that object's current board; the viewer has no in-app way to go back to the overwritten board. Never use replacement merely for a cleaner canvas, a different layout, a new lesson/topic, or because continuing would be visually harder.

Pass one compact JSON array string in `elements`; it must contain only drawing elements plus local drawing controls such as `delete`, `translate`, and `cameraUpdate`. It must be valid JSON: no comments, no trailing commas. The argument is already a string field, so write plain JSON inside it, not a second escaped JSON string, and do not wrap it in Markdown fences. Do not put `restoreCheckpoint` or `replaceCurrentBoard` inside `elements`; `boardAction` controls board persistence.

Before any update that preserves existing content, call `whiteboard_read_context` with the same `objectID`. Use stable semantic ids. For replacement elements, delete the old ids and draw replacements with new semantic ids; never reuse a deleted id. Use `translate` to move related ids together. For local redesigns, delete the old ids and redraw that area with new ids.

Do not assume standalone text `width` wraps long copy; use explicit line breaks or separate text elements when you need multi-line body text. Do not use this tool for prose-only answers or when a Mermaid diagram is the clearer static representation.
