import presentParameters from "./present.parameters.json?raw"
import type { ToolDesign } from "../model"
import { TODAY_BENCH_PRESENT, TODAY_PRESENT_MEDIA } from "../today/present-tools"

export const PRESENT_BY_INTENT_DESIGN: ToolDesign = {
  id: "present-by-intent",
  label: "Tool design 02",
  status: "proposed",
  title: "One present tool, placed by Buddy",
  summary:
    "Merge present_media and bench_present into one present tool. Buddy chooses inline or the Bench for every item, the tool shows it there, and the result says what the user can actually see.",
  why: [
    "Design 01 told Buddy which file types go where. That was a product limit written as a rule, and the prompt would need editing every time rendering changed.",
    "Here the prompt only describes the two places. Choosing between them is Buddy's call, made by what the moment needs.",
    "If something can't display where Buddy put it, the result says so, and Buddy can adjust. The fix for the gap is in rendering, not in the prompt.",
    "One line is temporary: inline plays only images, video, and audio for now. It is deleted when inline can show more, which is a code change outside this branch.",
    "Amends N30, which had the tool route by file type. N30's goal stays: \"presented\" means the user can see it.",
  ],
  tools: [
    TODAY_PRESENT_MEDIA,
    TODAY_BENCH_PRESENT,
    {
      id: "present",
      name: "present",
      stage: "proposed",
      description: `Show the user an existing file, prepared reading resource, or Buddy object; bring an open Bench tab back to the front; or close the Bench.

There are two places to show something:
- inline: in the conversation, next to your message.
- bench: beside the chat, in its own tab, where the user can read it, work in it, and come back to it. The Bench shows one tab at a time. Showing something that already has a tab focuses that tab instead of opening a copy.

Inline currently plays only images, video, and audio. Any other file shown inline appears as a file chip, and the user cannot see its content.

The result says, for each item, what the user can now see and where. Use focus_tab to return to an open tab, including a Browser tab; focusing a Browser tab only brings it to the front. Use close only when the user asks. To show a web page, open it in the Browser.`,
      parameters: presentParameters,
      returns: [
        {
          situation: "show inline: an image, a video, and a PDF",
          text: "Showed 3 items inline.\n- figure.png: the user can see it.\n- lecture.mp4: the user can play it.\n- notes.pdf: file chip only; the user cannot see its content.\nobject_kind=media-presentation\nobject_id=…",
        },
        {
          situation: "show bench: a PDF and a Markdown file",
          text: "Showed 2 items on the Bench.\n- notes.pdf: open and selected; the user can see it.\n- summary.md: open in another tab; the user sees it once it is selected.",
        },
        {
          situation: "show bench: a diagram made earlier in the chat",
          text: "Showed 1 item on the Bench.\n- diagram \"Series circuit\": open and selected; the user can see it.",
        },
        {
          situation: "show bench: a DOCX that has not been prepared",
          text: "Nothing shown.\n- syllabus.docx: not shown. The Bench opens DOCX only as a prepared resource; prepare it with prepare_resource, then show the resource.",
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
