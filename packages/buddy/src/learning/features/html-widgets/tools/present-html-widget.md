Present a local HTML widget: a small interactive page the user acts on. Choose this when understanding comes from the user's own action—changing a variable and watching the consequence, testing a prediction, running a process at their own pace, sorting or building something and getting feedback—or when the user asks for an interactive widget, simulation, or game. For something to look at, use prose, a table, a plot, a diagram, or a figure. For ordinary worksheets, handouts, and document-form quizzes, follow `teaching-resource-authoring`; use HTML only when runtime behavior is needed. When an established simulation or interactive already does the job, opening it in the Browser can beat building a new one.

Build the page around one meaningful action whose consequence is easy to see, and give the user a specific thing to try; controls without interpretable feedback are not a reason to use a widget. Load the `interactive-pages` skill before building or substantially revising a widget. Buddy does not receive the user's control actions, so ask for what they observed when it affects your next step.

Call this only after creating or editing a real `.html` or `.htm` file, or a widget folder with an HTML entry file and local relative assets. The tool adopts the source into Buddy-managed storage and presents the live widget; it does not accept raw HTML source or provide a backend. Use `present_media` for existing images, PDFs, videos, audio, and other media files. Use the widget's returned object identity and managed source for subsequent edits.

The widget always renders as an inline card in the chat. Widgets authored for `standard_16_10`, `wide_16_9`, or `tall_mobile` also open on the Bench and take focus; `compact_4_3` and `square` widgets stay inline unless you move them onto the Bench with `bench_present` `present_object`.

There are only two modes. For a first presentation, use `action: "present_path"` with a real local `path` and a required learner-facing `title`; omit `objectID`. Never put the title, filename, display name, path, or description in `objectID`; `objectID` is only a returned 26-character Buddy object id from a previous successful tool call. For re-presenting an existing widget, use `action: "present_object"` with only that returned `objectID` and omit path/title/entry/description/viewport fields.

Field ownership is strict:

- `path` is the source file or source folder only; it is not a title and not an object id.
- `title` is the learner-facing widget name, such as "Counter Widget"; put display names here, never in `objectID`.
- `objectID` is only a copied `object_id` returned by Buddy after a successful previous call; do not invent it.
- `entryPath` is only the entry HTML file inside a folder `path`, such as `index.html`; omit it when `path` already points at an HTML file.
- `description` is optional learner-facing summary text; it is not a substitute for `title`.
- `viewportPreset` is required for `present_path` and omitted for `present_object`.

Before calling this tool with `action: "present_path"`, keep the widget local. For a single HTML file, inline its CSS and JavaScript. For a multi-file widget, put the HTML, JS, CSS, images, and other assets in one folder and reference them with relative paths from the entry file. Prefer a workspace-relative `path`, but absolute paths, `file://` URLs, and home-relative `~/` paths are valid when they resolve inside the current workspace. Paths outside the workspace are rejected. If `path` is a folder, provide `entryPath` for the `.html` or `.htm` entry file inside that folder. Choose the viewport preset that best matches the layout you authored: `standard_16_10` for most lesson widgets, `wide_16_9` for wide simulations or canvas scenes, `square` for centered manipulatives, `compact_4_3` for small quizzes or controls, and `tall_mobile` only for phone-shaped experiences.

Valid first presentation of an HTML file:

```json
{
  "action": "present_path",
  "path": "widgets/fraction-builder.html",
  "title": "Fraction Builder",
  "viewportPreset": "standard_16_10"
}
```

Valid first presentation of a widget folder:

```json
{
  "action": "present_path",
  "path": "widgets/projectile-sim",
  "entryPath": "index.html",
  "title": "Projectile Motion Simulator",
  "viewportPreset": "wide_16_9"
}
```

Valid re-presentation after editing returned managed source:

```json
{
  "action": "present_object",
  "objectID": "01KG1A0KH77HJ9QGAQ5QK0N4BD"
}
```

After a successful `present_path`, the original path is consumed. Use only the returned `source_root` or `edit_path` for later edits, then call this tool with `action: "present_object"` and the returned `object_id` to present the current version again. Existing transcript cards for that object hydrate the current runtime, so normal file edits under `source_root` update the widget view without creating a frozen copy.

The widget runtime blocks network access, remote scripts, remote stylesheets, fetches, forms, popups, and parent Buddy access, so do not rely on CDNs, external assets, or backend calls.
