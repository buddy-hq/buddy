import presentParameters from "./present.parameters.json?raw"
import type { ToolDesign } from "../model"
import { TODAY_BENCH_PRESENT, TODAY_PRESENT_MEDIA } from "../today/present-tools"

export const PRESENT_MERGE_DESIGN: ToolDesign = {
  id: "present-merge",
  label: "Tool design 01",
  status: "historical",
  title: "One present tool",
  summary:
    "Merge present_media and bench_present into one present tool. Where something appears follows from what can display there, and the result says what the user can see.",
  why: [
    "Today a PDF can be shown three ways, and one of them (the inline gallery) shows only a file chip. Buddy then tells the user they can see it.",
    "With one tool, Buddy can't pick a place that can't display the file. It only chooses where both work: images, video, and audio.",
    "Decided on 28 Sep (N30). It is built after the figure-tool merge, and saved chats that contain the old tools must still render.",
  ],
  tools: [
    TODAY_PRESENT_MEDIA,
    TODAY_BENCH_PRESENT,
    {
      id: "present",
      name: "present",
      stage: "proposed",
      description: `Show the user an existing file, prepared reading resource, or Buddy object; bring an open Bench tab back to the front; or close the Bench.

Where each item appears follows from what can display there:
- Images, video, and audio appear inline in the chat, or on the Bench when you set where to bench.
- PDFs, text, code, CSV, and Markdown open on the Bench. Markdown opens in the editor.
- Documents such as DOCX, PPTX, XLSX, and EPUB open in the Bench reader. Prepare them with prepare_resource first, then show the prepared resource.
- Buddy objects that first appeared inline, such as a diagram, figure, widget, question set, or flashcard deck, move onto the Bench.

The Bench shows one tab at a time. Showing something that already has a tab focuses that tab instead of opening a copy. Use focus_tab to return to an open tab, including a Browser tab; focusing a Browser tab only brings it to the front. Use close only when the user asks.

The result says, for each item, what the user can now see and where. Not for web pages (use the Browser), writing content, or editing a whiteboard.`,
      parameters: presentParameters,
      returns: [
        {
          situation: "show: an image, a video, and a PDF",
          text: "Showed 3 items.\n- figure.png: visible inline.\n- lecture.mp4: playable inline.\n- notes.pdf: open on the Bench and selected.\nobject_kind=media-presentation\nobject_id=…",
        },
        {
          situation: "show: two files that both open on the Bench",
          text: "Showed 2 items on the Bench.\n- notes.pdf: open and selected; the user can see it.\n- summary.md: open in another tab; not visible until selected.",
        },
        {
          situation: "show: a document that has not been prepared",
          text: "Showed 1 of 2 items.\n- diagram.png: visible inline.\n- syllabus.docx: not shown. Prepare it with prepare_resource, then show the prepared resource.",
        },
        { situation: "focus_tab", text: "Focused Bench tab lesson.pdf; the user can see it." },
        { situation: "close", text: "Closed the Bench." },
        {
          situation: "The selected tab has unsaved work (returned as an error)",
          text: "Nothing changed: the selected Bench tab has unsaved work.",
        },
      ],
    },
  ],
}
