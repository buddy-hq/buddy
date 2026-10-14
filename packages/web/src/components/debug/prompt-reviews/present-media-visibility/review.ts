import descriptionBefore from "./present-media-description.before.md?raw"
import resultBefore from "./present-media-result.before.md?raw"
import { replacePromptSpan, type PromptReview } from "../model"

const descriptionOpeningBefore =
  "Show one or more existing local files to the user inline in the chat as a media gallery: images, PDFs, video, audio, or other media. Use it when the user should see a file now, such as a photograph or figure you saved, an image the user provided, a recording, or a file produced by another step."

const descriptionOpeningAfter =
  "Show existing local images, video, or audio to the user inline in the chat as a media gallery. Any other file, such as a PDF, text, Markdown, or office document, appears only as a file chip with open actions; the user does not see its content. Use it when the user should see or hear a file now, such as a photograph or figure you saved, an image the user provided, or a recording."

const readerSentence =
  "Readable books, papers, and chapters belong in the resource pipeline and the Bench reader rather than a gallery."

const readerSentenceAfter =
  "Readable books, papers, and chapters belong in the resource pipeline and the Bench reader rather than a gallery. To show the content of any other PDF, text, or Markdown file, open it on the Bench with bench_present present_file."

const descriptionAfter = [
  [descriptionOpeningBefore, descriptionOpeningAfter],
  [readerSentence, readerSentenceAfter],
].reduce(
  (prompt, [original, replacement]) => replacePromptSpan(prompt, original, replacement),
  descriptionBefore,
)

const resultAfter = replacePromptSpan(
  resultBefore,
  "Presented 3 media items.",
  "Presented 3 items inline. The user can see figure.png and play lecture.mp4. notes.pdf shows only as a file chip; the user cannot see its content.",
)

export const PRESENT_MEDIA_VISIBILITY_REVIEW: PromptReview = {
  id: "present-media-visibility",
  label: "Proposal 04",
  status: "proposed",
  title: "present_media: say what the user can see",
  summary:
    "Stop Buddy claiming the user can see a file when only a chip appears. The description says up front what displays inline, and the result says what actually did.",
  note: "Two comparisons: the tool description, and an example result for a batch of figure.png, lecture.mp4, and notes.pdf. The live tool has not been changed.",
  comparisons: [
    {
      id: "description",
      target: "features/media-presentations/tools/present-media.ts (description)",
      sourcePath: "packages/buddy/src/learning/features/media-presentations/tools/present-media.ts",
      title: "Description: only images, video, and audio display",
      explanation:
        "The description says the gallery shows \"images, PDFs, video, audio, or other media\". In the app only images, video, and audio display inline; every other file, PDFs included, shows as a file chip. Buddy picks this tool for a PDF it wants the user to read, then tells them they can see it. The description now says what displays, and points to the Bench for readable files, the one sibling this tool is genuinely confused with.",
      before: descriptionBefore,
      after: descriptionAfter,
      beforeSummary: ["Claims PDFs and other media show inline", "No hint where readable files belong"],
      afterSummary: [
        "Only images, video, and audio display inline",
        "Other files show as a chip; content not visible",
        "PDF, text, Markdown content: open on the Bench",
      ],
      expectedEffects: [
        "Buddy stops choosing the gallery to show a PDF's content",
        "Readable files go to the Bench, where the user can see them",
      ],
    },
    {
      id: "result",
      target: "present_media result (example batch)",
      title: "Result: say what the user sees, item by item",
      explanation:
        "After the call, Buddy only learns \"Presented 3 media items.\" It has no signal that the PDF showed as a chip, so it says \"you can see it here\". The result now names what the user can see or play and what shows only as a chip. It states what happened and leaves the next step to Buddy.",
      before: resultBefore,
      after: resultAfter,
      beforeSummary: ["A count only", "No signal of what is visible"],
      afterSummary: [
        "Names what the user can see or play",
        "Names what shows only as a chip",
      ],
      expectedEffects: [
        "No more \"you can see it\" for a chip",
        "Buddy can offer to open the PDF on the Bench",
      ],
    },
  ],
}
