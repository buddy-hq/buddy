import benchPresentParameters from "./bench_present.parameters.json?raw"
import presentMediaParameters from "./present_media.parameters.json?raw"
import type { ToolPrompt } from "../model"

export const TODAY_PRESENT_MEDIA: ToolPrompt = {
  id: "present_media",
  name: "present_media",
  stage: "today",
  description: `Show one or more existing local files to the user inline in the chat as a media gallery: images, PDFs, video, audio, or other media. Use it when the user should see a file now, such as a photograph or figure you saved, an image the user provided, a recording, or a file produced by another step. Group related files in one call and leave out temporary or intermediate outputs.

Paths may be workspace-relative, absolute local paths, file:// URLs, or ~/ home-relative paths; paths outside the workspace ask the user for permission.

Use present_html_widget for HTML, and skip this for plots the calculator already returned or images imagegen already displayed. Readable books, papers, and chapters belong in the resource pipeline and the Bench reader rather than a gallery. To show a web page, online video, or simulation, open it in the Browser.

The gallery is saved as a media object; move it onto the Bench with bench_present present_object when the user will keep working with it.`,
  parameters: presentMediaParameters,
  returns: [
    {
      situation: "An image, a video, and a PDF",
      text: "Presented 3 media items.\nobject_kind=media-presentation\nobject_id=…",
    },
  ],
}

export const TODAY_BENCH_PRESENT: ToolPrompt = {
  id: "bench_present",
  name: "bench_present",
  stage: "today",
  description: `Show something on the Bench, return to an open tab, or close the Bench. The Bench shows one tab at a time, and the selected tab is what you and the user are both looking at. If the target already has a tab, that tab is focused instead of opening a copy.

Use present_file to open an existing local file the user should read or work in; Markdown opens in the Bench editor. Use present_resource to open a prepared reading resource in the reader, such as the user's own books, papers, and documents. Use present_object to put an existing Buddy object on the Bench: a diagram, figure, media gallery, HTML widget, question set, or flashcard deck that first appeared inline and that the user will keep using, or a whiteboard. Use focus_tab to return to an already-open file or Browser tab only with an exact current tabKey copied from bench_read_context; a missing key means the tab set is stale and must be read again. Focusing a Browser tab only brings it to the front; it does not let you read, click, type into, or capture the page. Use close only when the user asks to close the Bench.

Files inside the workspace open directly. Paths that resolve outside it request external-folder permission and then open through a Bench-resolvable Buddy object. For Buddy objects, pass only objectID copied from a prior tool result. Do not pass object kind, revision id, item id, view id, routes, layout pixels, or user preferences.

This tool does not author or modify content. For an approved external file it creates only a managed reference needed by Bench. Do not use it to open web pages (use the Browser), render media inline, create an HTML widget, edit a whiteboard, choose layout pixels, change user preferences, or build routes.`,
  parameters: benchPresentParameters,
  returns: [
    { situation: "present_file with a PDF", text: "Requested Bench presentation for notes/lesson.pdf." },
    { situation: "focus_tab", text: "Focused Bench tab lesson.pdf." },
    { situation: "close", text: "Requested closing Bench." },
    {
      situation: "The selected tab has unsaved work (returned as an error)",
      text: "Bench did not change because the current Bench target has unsaved work.",
    },
  ],
}
